// ============================================================
// MiniMind — research/benchmark/ResearchBenchmarkReport.ts
// ============================================================
// Phase 62: Suite-level benchmark research report.
//
// Wraps a BenchmarkSuiteResult with generated conclusions into a
// structured, serializable report. Supports JSON and Markdown
// export for sharing, archival, and comparison.
//
// This is the top-level report artifact — it combines raw benchmark
// data with structured conclusions into a single document.
//
// Design principles:
//   - Self-contained — all data needed to reproduce the analysis
//   - Serializable — JSON and Markdown export
//   - Evidence-backed — every claim links to specific metrics
//   - Browser-safe — no fs/path dependencies
// ============================================================

import type { BenchmarkSuiteResult, SuiteMemberResult } from "./BenchmarkSuite";
import type {
  ResearchConclusions,
  ResearchConclusion,
} from "./ResearchConclusion";
import { generateConclusions } from "./ResearchConclusion";

// ============================================================
// Report Types
// ============================================================

/**
 * A complete benchmark research report.
 *
 * Contains raw benchmark data, generated conclusions, and metadata
 * sufficient to reproduce the analysis.
 */
export interface BenchmarkResearchReport {
  /** Report metadata */
  meta: {
    /** Report title */
    title: string;
    /** When the report was generated */
    generatedAt: number;
    /** Report format version */
    version: 1;
    /** Source benchmark suite name */
    suiteName: string;
    /** Number of suite members */
    memberCount: number;
    /** Total benchmark duration (ms) */
    totalDurationMs: number;
  };

  /** Per-member summary table */
  members: Array<{
    key: string;
    label: string;
    isBaseline: boolean;
    metrics: {
      bestLoss: { mean: number; std: number };
      perplexity: { mean: number; std: number };
      throughput: { mean: number; std: number };
      totalParams: number;
    };
    convergence: {
      converged: number;
      totalRuns: number;
      lossReduction: number;
    };
  }>;

  /** Rankings */
  rankings: {
    byBestLoss: Array<{ rank: number; key: string; label: string; value: number }>;
    byThroughput: Array<{ rank: number; key: string; label: string; value: number }>;
    byPerplexity: Array<{ rank: number; key: string; label: string; value: number }>;
  };

  /** Baseline-relative improvements */
  improvements: Array<{
    key: string;
    label: string;
    lossChangePercent: number;
    throughputChangePercent: number;
  }>;

  /** Generated conclusions */
  conclusions: {
    summary: string;
    critical: ResearchConclusion[];
    important: ResearchConclusion[];
    notable: ResearchConclusion[];
    info: ResearchConclusion[];
  };

  /** Raw data (for reproducibility) */
  raw: {
    /** Per-member raw benchmark results */
    members: Array<{
      key: string;
      label: string;
      runs: Array<{
        runIndex: number;
        seed: number;
        initialLoss: number;
        finalLoss: number;
        bestLoss: number;
        perplexity: number;
        tokensPerSecond: number;
        durationMs: number;
      }>;
    }>;
  };
}

// ============================================================
// Report Generator
// ============================================================

/**
 * Generate a BenchmarkResearchReport from a BenchmarkSuiteResult.
 *
 * Combines raw benchmark data with auto-generated conclusions
 * into a single structured report.
 *
 * @param suiteResult — completed benchmark suite result
 * @param title — optional report title (defaults to suite name)
 * @returns complete benchmark research report
 */
export function createBenchmarkResearchReport(
  suiteResult: BenchmarkSuiteResult,
  title?: string
): BenchmarkResearchReport {
  const conclusions = generateConclusions(suiteResult);

  // Build per-member summaries
  const members = suiteResult.members.map((mr) => ({
    key: mr.member.key,
    label: mr.member.label,
    isBaseline: mr.member.isBaseline,
    metrics: {
      bestLoss: {
        mean: mr.report.metrics.bestLoss.mean,
        std: mr.report.metrics.bestLoss.std,
      },
      perplexity: {
        mean: mr.report.metrics.perplexity.mean,
        std: mr.report.metrics.perplexity.std,
      },
      throughput: {
        mean: mr.report.metrics.throughput.mean,
        std: mr.report.metrics.throughput.std,
      },
      totalParams: mr.report.metrics.totalParams,
    },
    convergence: {
      converged: mr.report.convergence.runsConverged,
      totalRuns: mr.report.convergence.totalRuns,
      lossReduction: mr.report.convergence.avgLossReduction,
    },
  }));

  // Build rankings with explicit rank numbers
  const byBestLoss = suiteResult.comparison.byBestLoss.map(
    (r, i) => ({
      rank: i + 1,
      key: r.key,
      label: r.label,
      value: r.value,
    })
  );

  const byThroughput = suiteResult.comparison.byThroughput.map(
    (r, i) => ({
      rank: i + 1,
      key: r.key,
      label: r.label,
      value: r.value,
    })
  );

  const byPerplexity = suiteResult.comparison.byPerplexity.map(
    (r, i) => ({
      rank: i + 1,
      key: r.key,
      label: r.label,
      value: r.value,
    })
  );

  // Build improvements
  const improvements = suiteResult.comparison.improvements.map(
    (imp) => ({
      key: imp.key,
      label: imp.label,
      lossChangePercent: imp.lossImprovement * 100,
      throughputChangePercent: imp.throughputImprovement * 100,
    })
  );

  // Categorize conclusions by severity
  const critical = conclusions.conclusions.filter(
    (c) => c.severity === "critical"
  );
  const important = conclusions.conclusions.filter(
    (c) => c.severity === "important"
  );
  const notable = conclusions.conclusions.filter(
    (c) => c.severity === "notable"
  );
  const info = conclusions.conclusions.filter(
    (c) => c.severity === "info"
  );

  // Build raw data
  const rawMembers = suiteResult.members.map((mr) => ({
    key: mr.member.key,
    label: mr.member.label,
    runs: mr.result.runs.map((run) => ({
      runIndex: run.runIndex,
      seed: run.seed,
      initialLoss: run.initialLoss,
      finalLoss: run.finalLoss,
      bestLoss: run.bestLoss,
      perplexity: run.perplexity,
      tokensPerSecond: run.tokensPerSecond,
      durationMs: run.durationMs,
    })),
  }));

  return {
    meta: {
      title: title ?? suiteResult.name,
      generatedAt: Date.now(),
      version: 1,
      suiteName: suiteResult.name,
      memberCount: suiteResult.members.length,
      totalDurationMs: suiteResult.totalDurationMs,
    },
    members,
    rankings: {
      byBestLoss,
      byThroughput,
      byPerplexity,
    },
    improvements,
    conclusions: {
      summary: conclusions.summary,
      critical,
      important,
      notable,
      info,
    },
    raw: {
      members: rawMembers,
    },
  };
}

// ============================================================
// Serialization
// ============================================================

/**
 * Serialize a BenchmarkResearchReport to JSON.
 */
export function reportToJSON(report: BenchmarkResearchReport): string {
  return JSON.stringify(report, null, 2);
}

/**
 * Deserialize a BenchmarkResearchReport from JSON.
 */
export function reportFromJSON(json: string): BenchmarkResearchReport {
  const parsed: unknown = JSON.parse(json);
  // Basic validation
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("meta" in parsed)
  ) {
    throw new Error(
      "Invalid BenchmarkResearchReport JSON: missing meta field"
    );
  }
  return parsed as BenchmarkResearchReport;
}

// ============================================================
// Markdown Export
// ============================================================

/**
 * Export a BenchmarkResearchReport as Markdown.
 *
 * Produces a well-structured Markdown document suitable for
 * sharing, archival, and documentation.
 */
export function reportToMarkdown(
  report: BenchmarkResearchReport
): string {
  const lines: string[] = [];

  // Title
  lines.push(`# ${report.meta.title}`);
  lines.push("");
  lines.push(
    `**Generated:** ${new Date(report.meta.generatedAt).toISOString()}  `
  );
  lines.push(
    `**Suite:** ${report.meta.suiteName}  \n` +
    `**Members:** ${report.meta.memberCount}  \n` +
    `**Duration:** ${(report.meta.totalDurationMs / 1000).toFixed(1)}s  `
  );
  lines.push("");

  // Executive Summary
  lines.push("## Executive Summary");
  lines.push("");
  lines.push(report.conclusions.summary);
  lines.push("");

  // Summary Table
  lines.push("## Results");
  lines.push("");
  lines.push(
    "| Configuration | Best Loss | Perplexity | Throughput | Params | Converged |"
  );
  lines.push(
    "|--------------|-----------|------------|------------|--------|-----------|"
  );

  for (const m of report.members) {
    const baseline = m.isBaseline ? " ★" : "";
    const lossStr =
      `${m.metrics.bestLoss.mean.toFixed(4)} ± ${m.metrics.bestLoss.std.toFixed(4)}`;
    const pplStr =
      `${m.metrics.perplexity.mean.toFixed(1)} ± ${m.metrics.perplexity.std.toFixed(1)}`;
    const tpsStr = `${m.metrics.throughput.mean.toFixed(0)}`;
    const paramsStr = m.metrics.totalParams.toLocaleString();
    const convStr = `${m.convergence.converged}/${m.convergence.totalRuns}`;
    lines.push(
      `| ${m.label}${baseline} | ${lossStr} | ${pplStr} | ${tpsStr} | ${paramsStr} | ${convStr} |`
    );
  }
  lines.push("");

  // Rankings
  lines.push("## Rankings");
  lines.push("");

  lines.push("### By Best Loss");
  for (const r of report.rankings.byBestLoss) {
    lines.push(`${r.rank}. **${r.label}**: ${r.value.toFixed(4)}`);
  }
  lines.push("");

  lines.push("### By Throughput");
  for (const r of report.rankings.byThroughput) {
    lines.push(
      `${r.rank}. **${r.label}**: ${r.value.toFixed(0)} tok/s`
    );
  }
  lines.push("");

  // Improvements
  if (report.improvements.length > 0) {
    lines.push("## Improvements vs Baseline");
    lines.push("");
    lines.push(
      "| Configuration | Δ Loss | Δ Throughput |"
    );
    lines.push(
      "|--------------|--------|-------------|"
    );

    for (const imp of report.improvements) {
      const lossSign = imp.lossChangePercent < 0 ? "↓" : "↑";
      const tpsSign = imp.throughputChangePercent > 0 ? "↑" : "↓";
      lines.push(
        `| ${imp.label} | ${lossSign} ${Math.abs(imp.lossChangePercent).toFixed(1)}% | ` +
        `${tpsSign} ${Math.abs(imp.throughputChangePercent).toFixed(1)}% |`
      );
    }
    lines.push("");
  }

  // Conclusions
  lines.push("## Conclusions");
  lines.push("");

  const severitySections: Array<{
    label: string;
    icon: string;
    items: ResearchConclusion[];
  }> = [
    { label: "Critical", icon: "🔴", items: report.conclusions.critical },
    { label: "Important", icon: "🟠", items: report.conclusions.important },
    { label: "Notable", icon: "🟡", items: report.conclusions.notable },
    { label: "Info", icon: "🔵", items: report.conclusions.info },
  ];

  for (const section of severitySections) {
    if (section.items.length === 0) continue;

    lines.push(`### ${section.icon} ${section.label}`);
    lines.push("");

    for (const c of section.items) {
      lines.push(`- **[${c.category}]** ${c.statement}`);
      if (c.evidence && Object.keys(c.evidence).length > 0) {
        const ev = Object.entries(c.evidence)
          .map(
            ([k, v]) =>
              `\`${k}=${typeof v === "number" ? v.toFixed(4) : v}\``
          )
          .join(", ");
        lines.push(`  - Evidence: ${ev}`);
      }
      if (c.detail) {
        lines.push(`  - ${c.detail}`);
      }
    }
    lines.push("");
  }

  // Appendix: Raw Data
  lines.push("## Appendix: Raw Run Data");
  lines.push("");

  for (const m of report.raw.members) {
    lines.push(`### ${m.label}`);
    lines.push("");
    lines.push(
      "| Run | Seed | Initial Loss | Final Loss | Best Loss | PPL | Tok/s | Duration |"
    );
    lines.push(
      "|-----|------|-------------|-----------|-----------|-----|-------|----------|"
    );

    for (const run of m.runs) {
      lines.push(
        `| ${run.runIndex + 1} | ${run.seed} | ` +
        `${run.initialLoss.toFixed(4)} | ${run.finalLoss.toFixed(4)} | ` +
        `${run.bestLoss.toFixed(4)} | ${run.perplexity.toFixed(1)} | ` +
        `${run.tokensPerSecond.toFixed(0)} | ${(run.durationMs / 1000).toFixed(1)}s |`
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `*Report generated by MiniMind Research Benchmark v${report.meta.version}*`
  );

  return lines.join("\n");
}
