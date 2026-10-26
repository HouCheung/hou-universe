// ============================================================
// Ablation unit tests
// ============================================================
// Phase 50: Tests for ablation experiment framework.
// Covers: Ablation construction, addVariant, resolveConfig,
// estimateParams, buildComparisonTable, summarize, exportReport.
// ============================================================

import { Ablation } from "../Ablation";
import type { AblationConfig, AblationVariantResult } from "../Ablation";
import { getModelConfig } from "../ModelRegistry";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertThrows(fn: () => void, msg: string): void {
  try { fn(); failed++; console.error(`  FAIL: ${msg} — expected throw`); }
  catch { passed++; }
}

// ============================================================
// Helpers
// ============================================================

function makeResult(
  name: string,
  desc: string,
  config: AblationConfig,
  params: number,
  initLoss: number,
  finalLoss: number,
  bestLoss: number,
  tps: number,
  lossHistory: number[],
  durationMs: number
): AblationVariantResult {
  return {
    name, description: desc, config,
    estimatedParams: params,
    initialLoss: initLoss,
    finalLoss, bestLoss,
    tokensPerSecond: tps,
    lossHistory, durationMs,
  };
}

// ============================================================
// Test runner
// ============================================================

export function runAblationTests(): { passed: number; failed: number } {
  console.log("\n=== Ablation Tests ===\n");
  passed = 0; failed = 0;

  const baselineConfig: AblationConfig = {
    vocabSize: 1000,
    dModel: 128,
    numHeads: 4,
    dFF: 512,
    numLayers: 4,
    maxSeqLen: 256,
  };

  // ── Construction ──
  console.log("Construction:");

  // 1-3
  const ablation = new Ablation("test-study", baselineConfig);
  assert(ablation instanceof Ablation, "Ablation instance created");
  assert(ablation.baseline.dModel === 128, "baseline dModel preserved");
  assert(ablation.baseline.numLayers === 4, "baseline numLayers preserved");

  // 4-5: fromModelConfig factory
  const tinyConfig = getModelConfig("tiny");
  const fromConfig = Ablation.fromModelConfig("config-study", tinyConfig);
  assert(fromConfig instanceof Ablation, "fromModelConfig creates Ablation");
  assert(fromConfig.baseline.dModel === 128, "fromModelConfig preserves dModel");

  // ── addVariant ──
  console.log("addVariant:");

  // 6-8: Add single dimension variant
  ablation.addVariant("wider", { dModel: 256 });
  assert(ablation.variants.length === 1, "one variant registered");
  assert(ablation.variants[0].name === "wider", "variant name stored");
  assert(ablation.variants[0].description.includes("dModel"), "auto-generated description includes dimension");

  // 9-11: Add multiple variants
  ablation.addVariant("deeper", { numLayers: 8 });
  ablation.addVariant("more-heads", { numHeads: 8 });
  assert(ablation.variants.length === 3, "three variants registered");

  // 12-13: Custom description
  ablation.addVariant("custom", { dFF: 1024 }, "Custom FFN scaling test");
  assert(ablation.variants.length === 4, "four variants after custom");
  assert(
    ablation.variants[3].description === "Custom FFN scaling test",
    "custom description preserved"
  );

  // 14: Duplicate name throws
  assertThrows(() => ablation.addVariant("wider", { dModel: 512 }), "duplicate variant name throws");

  // ── resolveConfig ──
  console.log("resolveConfig:");

  // 15-18: Resolve variant config (baseline + overrides)
  const widerConfig = ablation.resolveConfig(ablation.variants[0]);
  assert(widerConfig.dModel === 256, "resolved: dModel overridden");
  assert(widerConfig.numLayers === 4, "resolved: numLayers from baseline");
  assert(widerConfig.vocabSize === 1000, "resolved: vocabSize from baseline");

  // 19-20
  const deeperConfig = ablation.resolveConfig(ablation.variants[1]);
  assert(deeperConfig.numLayers === 8, "resolved: numLayers overridden");
  assert(deeperConfig.dModel === 128, "resolved: dModel from baseline");

  // ── estimateParams ──
  console.log("estimateParams:");

  // 21-24
  const baselineParams = ablation.estimateParams(baselineConfig);
  const widerParams = ablation.estimateParams(widerConfig);
  const deeperParams = ablation.estimateParams(deeperConfig);

  assert(baselineParams > 0, "baseline params > 0");
  assert(widerParams > baselineParams, "wider model has more params");
  assert(deeperParams > baselineParams, "deeper model has more params");
  assert(typeof ablation.estimateParams({ vocabSize: 500, dModel: 64, numHeads: 2, dFF: 256, numLayers: 2, maxSeqLen: 32 }) === "number",
    "estimateParams works for minimal config");

  // ── buildComparisonTable ──
  console.log("buildComparisonTable:");

  // 25-28: Build comparison table
  const baselineResult = makeResult(
    "baseline", "Baseline model", baselineConfig,
    baselineParams, 5.0, 1.0, 0.8, 1000,
    [5.0, 3.0, 2.0, 1.5, 1.2, 1.0], 5000
  );

  const variantResults: AblationVariantResult[] = [
    makeResult("wider", "Wider model", widerConfig,
      widerParams, 5.0, 0.8, 0.6, 800,
      [5.0, 2.5, 1.5, 1.0, 0.9, 0.8], 6000),
  ];

  const table = ablation.buildComparisonTable(baselineResult, variantResults);
  assert(table.length === 2, "table has baseline + 1 variant row");
  assert(table[0].name === "baseline", "first row is baseline");
  assert(table[1].name === "wider", "second row is variant");

  // 29-31: Table row structure
  const variantRow = table[1];
  assert(typeof variantRow.params === "number", "table row has params");
  assert(typeof variantRow.paramsDelta === "string", "table row has paramsDelta string");
  assert(typeof variantRow.lossDelta === "number", "table row has lossDelta");

  // 32-33: Multiple variants
  const variant2Result = makeResult(
    "deeper", "Deeper model", deeperConfig,
    deeperParams, 5.0, 0.9, 0.7, 900,
    [5.0, 2.8, 1.8, 1.2, 1.0, 0.9], 5500,
  );
  const table2 = ablation.buildComparisonTable(baselineResult, [variantResults[0], variant2Result]);
  assert(table2.length === 3, "table with 2 variants has 3 rows");
  assert(table2[2].name === "deeper", "third row is deeper variant");

  // 34: Convergence steps computed
  assert(
    typeof variantRow.convergenceSteps === "number" || variantRow.convergenceSteps === undefined,
    "convergenceSteps is number or undefined"
  );

  // ── summarize ──
  console.log("summarize:");

  // 35-38: Generate summary
  const report = {
    name: "test-report",
    baseline: baselineConfig,
    baselineResult,
    variants: variantResults,
    comparisonTable: table,
    trainingConfig: { steps: 100, batchSize: 4, seqLen: 64, lr: 0.001, seed: 42 },
  };

  const summary = ablation.summarize(report);
  assert(typeof summary === "string" && summary.length > 0, "summarize returns string");
  assert(summary.includes("test-report"), "summary includes report name");
  assert(summary.includes("baseline"), "summary mentions baseline");
  assert(summary.includes("Key Findings"), "summary has Key Findings section");

  // ── exportReport ──
  console.log("exportReport:");

  // 39-42: Export to JSON-serializable
  const exported = ablation.exportReport(report);
  assert(typeof exported === "object" && exported !== null, "exportReport returns object");
  assert(exported.name === "test-report", "exported report has name");
  assert(typeof exported.baseline === "object", "exported report has baseline");
  assert(Array.isArray(exported.variants), "exported report variants is array");

  // 43-44: JSON roundtrip
  const jsonStr = JSON.stringify(exported);
  const parsed = JSON.parse(jsonStr);
  assert(parsed.name === "test-report", "JSON roundtrip preserves name");
  assert(parsed.comparisonTable.length === 2, "JSON roundtrip preserves comparisonTable");

  console.log(`\nAblation: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

if (require.main === module) {
  runAblationTests();
}
