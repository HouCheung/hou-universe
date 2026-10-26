// ============================================================
// Phase 63: Generate Gradient Clipping Research Report
// ============================================================
// Run: npx tsx src/lib/minimind/research/studies/gradient-clipping/generate-report.ts
//
// This script runs the full gradient clipping study through
// BenchmarkSuite, generates structured reports (JSON + Markdown),
// and supplements them with gradient-specific stability analysis.
// ============================================================

import { ResearchBenchmarkRunner } from "../../benchmark/ResearchBenchmarkRunner";
import { BenchmarkSuite } from "../../benchmark/BenchmarkSuite";
import {
  createBenchmarkResearchReport,
  reportToJSON,
  reportToMarkdown,
} from "../../benchmark/ResearchBenchmarkReport";
import { BenchmarkCopilot } from "../../copilot/BenchmarkCopilot";
import {
  computeMetricSummary,
  compareMetricSummaries,
} from "../../ResearchStudy";
import { verifyControlledVariables } from "../../ControlledVariableValidator";
import {
  baselineExperiment,
  clippedExperiment,
  STUDY_CORPUS,
  gradientClippingStudy,
} from "./study";
import type {
  ResearchBenchmarkProfile,
  ResearchBenchmarkResult,
} from "../../benchmark/ResearchBenchmarkRunner";
import type { StudyConclusion } from "../../ResearchStudy";
import * as fs from "fs";
import * as path from "path";

const OUTPUT_DIR = path.resolve("docs/research/studies");

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("Gradient Clipping Study — Research Report Generator");
  console.log("=".repeat(70));

  // Step 1: Validate controlled variables
  console.log("\n[1/5] Validating controlled variables...");
  const validation = verifyControlledVariables(
    baselineExperiment,
    clippedExperiment,
    "gradientClipNorm",
  );
  if (!validation.valid) {
    console.error("❌ VALIDATION FAILED:", validation.error);
    process.exit(1);
  }
  console.log("✅ Controlled variable validation PASSED");
  console.log("  " + validation.summary);

  // Step 2: Run experiments via BenchmarkSuite
  console.log("\n[2/5] Running experiments (this will take 30-60s)...");

  const runner = new ResearchBenchmarkRunner();
  const numRuns = 2;

  const baselineProfile: ResearchBenchmarkProfile = {
    name: "Baseline (no clip)",
    modelConfig: baselineExperiment.modelConfig,
    trainingConfig: baselineExperiment.trainingConfig,
    datasetConfig: baselineExperiment.datasetConfig,
    tokenizerConfig: baselineExperiment.tokenizerConfig,
    evaluationConfig: baselineExperiment.evaluationConfig,
    numRuns,
    seed: baselineExperiment.seed,
    corpus: STUDY_CORPUS,
  };

  const clippedProfile: ResearchBenchmarkProfile = {
    name: "Clipped (norm=1.0)",
    modelConfig: clippedExperiment.modelConfig,
    trainingConfig: clippedExperiment.trainingConfig,
    datasetConfig: clippedExperiment.datasetConfig,
    tokenizerConfig: clippedExperiment.tokenizerConfig,
    evaluationConfig: clippedExperiment.evaluationConfig,
    numRuns,
    seed: clippedExperiment.seed,
    corpus: STUDY_CORPUS,
  };

  const suite = new BenchmarkSuite("Gradient Clipping Study");
  suite.addProfile("baseline", baselineProfile, {
    label: "Baseline (no clip)",
    isBaseline: true,
  });
  suite.addProfile("clipped", clippedProfile, {
    label: "Clipped (norm=1.0)",
  });

  const suiteResult = await suite.runAll(runner, {
    name: "Gradient Clipping Study",
    numRuns,
    baseSeed: 42,
  });

  const baselineResult = suiteResult.members.find(
    (m) => m.member.key === "baseline",
  )!.result;
  const clippedResult = suiteResult.members.find(
    (m) => m.member.key === "clipped",
  )!.result;

  console.log(
    `  ✅ Baseline: best loss=${baselineResult.aggregate.bestLoss.mean.toFixed(4)}`,
  );
  console.log(
    `  ✅ Clipped:  best loss=${clippedResult.aggregate.bestLoss.mean.toFixed(4)}`,
  );

  // Step 3: Copilot analysis
  console.log("\n[3/5] Running copilot analysis...");
  const copilot = new BenchmarkCopilot();
  const copilotComparison = copilot.compareResults(
    baselineResult,
    clippedResult,
    "Baseline (no clip)",
    "Clipped (norm=1.0)",
  );
  console.log(`  ${copilotComparison.summary}`);
  console.log(`  ${copilotComparison.recommendation}`);

  // Step 4: Compute conclusion from real data
  console.log("\n[4/5] Computing research conclusion...");
  const conclusion = buildConclusion(baselineResult, clippedResult, numRuns);
  console.log(`  Verdict: ${conclusion.verdict.toUpperCase()}`);
  console.log(`  ${conclusion.summary}`);

  // Step 5: Generate reports
  console.log("\n[5/5] Generating report files...");

  // Generate standard benchmark report
  const benchmarkReport = createBenchmarkResearchReport(
    suiteResult,
    "Gradient Clipping Study — MiniMind Research Phase 63",
  );

  // Write standard reports
  const stdJsonPath = path.join(OUTPUT_DIR, "gradient-clipping-study.json");
  const stdMdPath = path.join(OUTPUT_DIR, "gradient-clipping-study.md");

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Build enhanced JSON (benchmark report + gradient data + conclusion)
  const enhancedJson = {
    ...benchmarkReport,
    study: {
      id: gradientClippingStudy.id,
      researchQuestion: gradientClippingStudy.researchQuestion,
      hypothesis: gradientClippingStudy.hypothesis,
      independentVariable: gradientClippingStudy.independentVariable,
      controlledVariables: gradientClippingStudy.controlledVariables,
    },
    gradientAnalysis: buildGradientAnalysis(baselineResult, clippedResult),
    copilot: {
      lossChangePercent: copilotComparison.lossImprovement * 100,
      throughputChangePercent: copilotComparison.throughputChange * 100,
      summary: copilotComparison.summary,
      recommendation: copilotComparison.recommendation,
    },
    conclusion: {
      verdict: conclusion.verdict,
      summary: conclusion.summary,
      detail: conclusion.detail,
      evidence: conclusion.evidence,
      confidence: conclusion.confidence,
    },
  };

  fs.writeFileSync(stdJsonPath, JSON.stringify(enhancedJson, null, 2), "utf-8");
  console.log(`  ✅ JSON report: ${stdJsonPath}`);

  // Build enhanced markdown (standard report + gradient sections + conclusion)
  const standardMd = reportToMarkdown(benchmarkReport);
  const enhancedMd = injectGradientSections(
    standardMd,
    baselineResult,
    clippedResult,
    conclusion,
    copilotComparison,
    numRuns,
  );
  fs.writeFileSync(stdMdPath, enhancedMd, "utf-8");
  console.log(`  ✅ Markdown report: ${stdMdPath}`);

  console.log("\n" + "=".repeat(70));
  console.log("Report generation complete!");
  console.log("=".repeat(70));
}

// ============================================================
// Conclusion Generation
// ============================================================

function buildConclusion(
  baselineResult: ResearchBenchmarkResult,
  clippedResult: ResearchBenchmarkResult,
  numRuns: number,
): StudyConclusion {
  const blRuns = baselineResult.runs;
  const clRuns = clippedResult.runs;

  const baselineLoss = baselineResult.aggregate.bestLoss;
  const clippedLoss = clippedResult.aggregate.bestLoss;

  const baselineMaxNorm = computeMetricSummary(
    "maxGradientNorm",
    blRuns.map((r) => r.maxGradientNorm),
  );
  const clippedMaxNorm = computeMetricSummary(
    "maxGradientNorm",
    clRuns.map((r) => r.maxGradientNorm),
  );

  const baselineNormVar = computeMetricSummary(
    "gradientNormVariance",
    blRuns.map((r) => r.gradientNormVariance),
  );
  const clippedNormVar = computeMetricSummary(
    "gradientNormVariance",
    clRuns.map((r) => r.gradientNormVariance),
  );

  const baselineDivergences = blRuns.filter((r) => r.divergenceDetected).length;
  const clippedDivergences = clRuns.filter((r) => r.divergenceDetected).length;
  const baselineInstabilities = blRuns.filter(
    (r) => r.instabilityDetected,
  ).length;
  const clippedInstabilities = clRuns.filter(
    (r) => r.instabilityDetected,
  ).length;

  const lossChangePct =
    baselineLoss.mean > 0
      ? ((clippedLoss.mean - baselineLoss.mean) / baselineLoss.mean) * 100
      : 0;
  const maxNormChangePct =
    baselineMaxNorm.mean > 0
      ? ((clippedMaxNorm.mean - baselineMaxNorm.mean) / baselineMaxNorm.mean) *
        100
      : 0;

  const evidence: Record<string, number> = {
    baselineBestLoss: baselineLoss.mean,
    clippedBestLoss: clippedLoss.mean,
    baselineFinalLoss: baselineResult.aggregate.loss.mean,
    clippedFinalLoss: clippedResult.aggregate.loss.mean,
    baselineMaxNorm: baselineMaxNorm.mean,
    clippedMaxNorm: clippedMaxNorm.mean,
    baselineNormVariance: baselineNormVar.mean,
    clippedNormVariance: clippedNormVar.mean,
    lossChangePercent: lossChangePct,
    maxNormChangePercent: maxNormChangePct,
    baselineDivergences,
    clippedDivergences,
    baselineInstabilities,
    clippedInstabilities,
  };

  // Deterministic conclusion logic
  if (
    clippedMaxNorm.mean < baselineMaxNorm.mean * 0.8 &&
    clippedLoss.mean <= baselineLoss.mean * 1.02 &&
    clippedDivergences === 0
  ) {
    return {
      verdict: "supported",
      summary:
        `Gradient clipping (norm=1.0) reduced maximum gradient norm by ` +
        `${Math.abs(maxNormChangePct).toFixed(1)}% while final loss ` +
        `${lossChangePct < 0 ? "improved" : "changed minimally"} by ` +
        `${Math.abs(lossChangePct).toFixed(1)}%. The hypothesis is SUPPORTED.`,
      detail:
        `Clipping effectively bounded gradient norms (max ${clippedMaxNorm.mean.toFixed(2)} vs ` +
        `${baselineMaxNorm.mean.toFixed(2)}) without harming convergence. ` +
        `No divergence was detected in any clipped run. ` +
        `${baselineDivergences > 0 ? `Baseline had ${baselineDivergences} divergence(s), suggesting clipping may prevent divergence.` : ""}`,
      evidence,
      confidence: 0.85,
    };
  }

  if (clippedLoss.mean > baselineLoss.mean * 1.05) {
    return {
      verdict: "rejected",
      summary: `Gradient clipping degraded convergence — loss increased by ${Math.abs(lossChangePct).toFixed(1)}%. The hypothesis is REJECTED.`,
      detail: `While clipping reduced gradient norms by ${Math.abs(maxNormChangePct).toFixed(1)}%, it came at the cost of significantly worse convergence.`,
      evidence,
      confidence: 0.9,
    };
  }

  return {
    verdict: "inconclusive",
    summary: `Results are inconclusive — insufficient evidence to support or reject the hypothesis (loss change: ${Math.abs(lossChangePct).toFixed(1)}%).`,
    detail: `More runs or a larger model may be needed to reach statistical significance.`,
    evidence,
    confidence: 0.3,
  };
}

// ============================================================
// Gradient Analysis
// ============================================================

function buildGradientAnalysis(
  baselineResult: ResearchBenchmarkResult,
  clippedResult: ResearchBenchmarkResult,
): Record<string, unknown> {
  const blRuns = baselineResult.runs;
  const clRuns = clippedResult.runs;

  const metrics = [
    "meanGradientNorm",
    "maxGradientNorm",
    "gradientNormVariance",
  ] as const;

  const analysis: Record<string, unknown> = {};

  for (const metric of metrics) {
    const bl = computeMetricSummary(
      metric,
      blRuns.map((r) => r[metric] as number),
    );
    const cl = computeMetricSummary(
      metric,
      clRuns.map((r) => r[metric] as number),
    );
    const comp = compareMetricSummaries(metric, bl, cl);

    analysis[metric] = {
      baseline: { mean: bl.mean, std: bl.std, min: bl.min, max: bl.max },
      clipped: { mean: cl.mean, std: cl.std, min: cl.min, max: cl.max },
      changePercent: comp.relativeChange * 100,
      direction: comp.direction,
      isMeaningful: comp.isMeaningful,
    };
  }

  // Divergence and instability
  analysis["divergenceDetected"] = {
    baseline: blRuns.filter((r) => r.divergenceDetected).length,
    clipped: clRuns.filter((r) => r.divergenceDetected).length,
  };
  analysis["instabilityDetected"] = {
    baseline: blRuns.filter((r) => r.instabilityDetected).length,
    clipped: clRuns.filter((r) => r.instabilityDetected).length,
  };

  return analysis;
}

// ============================================================
// Markdown Enhancement
// ============================================================

function injectGradientSections(
  standardMd: string,
  baselineResult: ResearchBenchmarkResult,
  clippedResult: ResearchBenchmarkResult,
  conclusion: StudyConclusion,
  copilotComparison: {
    summary: string;
    recommendation: string;
    lossImprovement: number;
    throughputChange: number;
  },
  numRuns: number,
): string {
  // Split the standard report at the "## Appendix" section
  const appendixIndex = standardMd.indexOf("## Appendix");

  const prefix =
    appendixIndex >= 0
      ? standardMd.slice(0, appendixIndex)
      : standardMd;
  const suffix =
    appendixIndex >= 0
      ? standardMd.slice(appendixIndex)
      : "\n## Appendix: Raw Run Data\n\n";

  const blRuns = baselineResult.runs;
  const clRuns = clippedResult.runs;

  // Build gradient-specific sections
  const sections: string[] = [];

  // ── Experimental Design ──
  sections.push("## Experimental Design");
  sections.push("");
  sections.push(
    "Controlled experiment with **one independent variable**: `gradientClipNorm`.",
  );
  sections.push("");
  sections.push("| Condition | gradientClipNorm |");
  sections.push("|-----------|-----------------|");
  sections.push(`| Baseline (A) | undefined (disabled) |`);
  sections.push(`| Clipped (B)  | 1.0 |`);
  sections.push("");
  sections.push("### Controlled Variables");
  sections.push("");
  const controlled = gradientClippingStudy.controlledVariables;
  for (const v of controlled) {
    sections.push(`- ${v}`);
  }
  sections.push("");

  // ── Model & Data ──
  sections.push("## Model & Data");
  sections.push("");
  sections.push(
    `- **Model:** MiniMind GPT (dModel=64, numHeads=4, dFF=128, numLayers=3, maxSeqLen=64)`,
  );
  sections.push(
    `- **Parameters:** ${blRuns[0]?.parameterCount?.toLocaleString() ?? "N/A"}`,
  );
  sections.push(`- **Tokenizer:** BPE (vocabSize=1000)`);
  sections.push(
    `- **Dataset:** Inline text corpus — 200 sentences (20 unique × 10 repeats)`,
  );
  sections.push(
    `- **Training:** 5 epochs, lr=0.001, AdamW (weightDecay=0.01), cosine scheduler`,
  );
  sections.push(`- **Batch:** batchSize=4, blockSize=32, gradientAccumulation=1`);
  sections.push(`- **Seed:** 42`);
  sections.push(`- **Runs per condition:** ${numRuns}`);
  sections.push("");

  // ── Gradient Stability ──
  sections.push("## Gradient Stability Analysis");
  sections.push("");

  const baselineMaxNorm = computeMetricSummary(
    "maxGradientNorm",
    blRuns.map((r) => r.maxGradientNorm),
  );
  const clippedMaxNorm = computeMetricSummary(
    "maxGradientNorm",
    clRuns.map((r) => r.maxGradientNorm),
  );
  const baselineMeanNorm = computeMetricSummary(
    "meanGradientNorm",
    blRuns.map((r) => r.meanGradientNorm),
  );
  const clippedMeanNorm = computeMetricSummary(
    "meanGradientNorm",
    clRuns.map((r) => r.meanGradientNorm),
  );
  const baselineNormVar = computeMetricSummary(
    "gradientNormVariance",
    blRuns.map((r) => r.gradientNormVariance),
  );
  const clippedNormVar = computeMetricSummary(
    "gradientNormVariance",
    clRuns.map((r) => r.gradientNormVariance),
  );

  sections.push(
    "| Metric | Baseline (no clip) | Clipped (norm=1.0) | Change |",
  );
  sections.push(
    "|--------|-------------------|--------------------|--------|",
  );

  const maxNormComp = compareMetricSummaries(
    "maxGradientNorm",
    baselineMaxNorm,
    clippedMaxNorm,
  );
  const maxNormPct = Math.abs(maxNormComp.relativeChange * 100).toFixed(1);
  const maxNormArrow =
    maxNormComp.direction === "decreased"
      ? "↓"
      : maxNormComp.direction === "increased"
        ? "↑"
        : "→";

  sections.push(
    `| Max Gradient Norm | ${baselineMaxNorm.mean.toFixed(2)} ± ${baselineMaxNorm.std.toFixed(2)} | ` +
      `${clippedMaxNorm.mean.toFixed(2)} ± ${clippedMaxNorm.std.toFixed(2)} | ${maxNormArrow} ${maxNormPct}% |`,
  );

  const meanNormComp = compareMetricSummaries(
    "meanGradientNorm",
    baselineMeanNorm,
    clippedMeanNorm,
  );
  const meanNormPct = Math.abs(meanNormComp.relativeChange * 100).toFixed(1);
  const meanNormArrow =
    meanNormComp.direction === "decreased"
      ? "↓"
      : meanNormComp.direction === "increased"
        ? "↑"
        : "→";
  sections.push(
    `| Mean Gradient Norm | ${baselineMeanNorm.mean.toFixed(2)} ± ${baselineMeanNorm.std.toFixed(2)} | ` +
      `${clippedMeanNorm.mean.toFixed(2)} ± ${clippedMeanNorm.std.toFixed(2)} | ${meanNormArrow} ${meanNormPct}% |`,
  );

  const varComp = compareMetricSummaries(
    "gradientNormVariance",
    baselineNormVar,
    clippedNormVar,
  );
  const varPct = Math.abs(varComp.relativeChange * 100).toFixed(1);
  const varArrow =
    varComp.direction === "decreased"
      ? "↓"
      : varComp.direction === "increased"
        ? "↑"
        : "→";
  sections.push(
    `| Gradient Norm Variance | ${baselineNormVar.mean.toFixed(2)} ± ${baselineNormVar.std.toFixed(2)} | ` +
      `${clippedNormVar.mean.toFixed(2)} ± ${clippedNormVar.std.toFixed(2)} | ${varArrow} ${varPct}% |`,
  );

  const baselineDiv = blRuns.filter((r) => r.divergenceDetected).length;
  const clippedDiv = clRuns.filter((r) => r.divergenceDetected).length;
  const baselineIns = blRuns.filter((r) => r.instabilityDetected).length;
  const clippedIns = clRuns.filter((r) => r.instabilityDetected).length;

  sections.push(
    `| Divergence Detected | ${baselineDiv}/${numRuns} | ${clippedDiv}/${numRuns} | — |`,
  );
  sections.push(
    `| Instability Detected | ${baselineIns}/${numRuns} | ${clippedIns}/${numRuns} | — |`,
  );
  sections.push("");

  sections.push(
    `Gradient clipping with norm=1.0 **${maxNormComp.direction === "decreased" ? "effectively bounded" : "changed"}** ` +
      `the maximum gradient norm from ${baselineMaxNorm.mean.toFixed(2)} to ${clippedMaxNorm.mean.toFixed(2)} ` +
      `(${maxNormArrow}${maxNormPct}%). ` +
      `The gradient norm variance ${varComp.direction} by ${varPct}%, ` +
      `indicating ${varComp.direction === "decreased" ? "more stable gradient dynamics" : "changed gradient dynamics"}.`,
  );
  sections.push("");

  // ── Research Conclusion ──
  sections.push("## Research Conclusion");
  sections.push("");
  sections.push(`**Verdict: ${conclusion.verdict.toUpperCase()}**`);
  sections.push("");
  sections.push(conclusion.summary);
  sections.push("");
  sections.push(conclusion.detail);
  sections.push("");
  sections.push("### Evidence");
  sections.push("");
  for (const [k, v] of Object.entries(conclusion.evidence)) {
    sections.push(`- **${k}**: ${v.toFixed(4)}`);
  }
  sections.push("");
  sections.push(
    `**Confidence**: ${(conclusion.confidence * 100).toFixed(0)}%`,
  );
  sections.push("");

  // ── Copilot Analysis ──
  sections.push("## Copilot Analysis");
  sections.push("");
  sections.push(`> ${copilotComparison.summary}`);
  sections.push("");
  sections.push(
    `**Loss change:** ${(copilotComparison.lossImprovement * 100).toFixed(1)}% ` +
      `(${copilotComparison.lossImprovement < 0 ? "improved" : "worsened"})`,
  );
  sections.push(
    `**Throughput change:** ${(copilotComparison.throughputChange * 100).toFixed(1)}% ` +
      `(${copilotComparison.throughputChange > 0 ? "faster" : "slower"})`,
  );
  sections.push("");
  sections.push(`**Recommendation**: ${copilotComparison.recommendation}`);
  sections.push("");

  // ── Limitations ──
  sections.push("## Limitations");
  sections.push("");
  sections.push(
    "- Small model size (64-dim, 3 layers) — results may not generalize to larger models",
  );
  sections.push(
    "- Inline text corpus (200 sentences) — limited linguistic diversity",
  );
  sections.push(
    `- ${numRuns} runs per condition — limited statistical power`,
  );
  sections.push(
    "- Single gradientClipNorm value (1.0) — does not explore optimal threshold",
  );
  sections.push(
    "- Short training (5 epochs) — longer training may reveal different dynamics",
  );
  sections.push("");

  // ── Reproduction ──
  sections.push("## Reproduction Instructions");
  sections.push("");
  sections.push("```bash");
  sections.push(
    "# Run the full test suite (includes real training for this study)",
  );
  sections.push(
    "npx tsx src/lib/minimind/research/__tests__/run.ts",
  );
  sections.push("");
  sections.push("# Generate the research report (this script)");
  sections.push(
    "npx tsx src/lib/minimind/research/studies/gradient-clipping/generate-report.ts",
  );
  sections.push("```");
  sections.push("");
  sections.push("### Study Files");
  sections.push("");
  sections.push(
    "- Study definition: `src/lib/minimind/research/studies/gradient-clipping/study.ts`",
  );
  sections.push(
    "- Baseline config: `src/lib/minimind/research/studies/gradient-clipping/baseline.json`",
  );
  sections.push(
    "- Clipped config: `src/lib/minimind/research/studies/gradient-clipping/clipped.json`",
  );
  sections.push("");

  // Assemble: standard report prefix + gradient sections + appendix
  return (
    prefix.trimEnd() +
    "\n\n" +
    sections.join("\n").trimEnd() +
    "\n\n" +
    suffix.trimEnd() +
    "\n"
  );
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
