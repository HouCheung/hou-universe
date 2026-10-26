// ============================================================
// ModelStats unit tests
// ============================================================
// Phase 50: Tests for model statistics and parameter counting.
// Covers: summarize, parameterCount, moduleParameterCount,
// parameterCountByGroup, trainableCount, parameterDetails.
// ============================================================

import { ModelStats } from "../ModelStats";
import type { ModelStatsReport } from "../ModelStats";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { Module } from "../../core/Module";
import { Parameter } from "../../core/Parameter";
import { Linear } from "../../core/Linear";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function assertClose(actual: number, expected: number, tolerance: number, msg: string): void {
  const diff = Math.abs(actual - expected);
  if (diff <= tolerance) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg} — expected ${expected}, got ${actual} (diff=${diff})`); }
}

// ============================================================
// Test runner
// ============================================================

export function runModelStatsTests(): { passed: number; failed: number } {
  console.log("\n=== ModelStats Tests ===\n");
  passed = 0; failed = 0;

  // ── summarize — Tiny model ──
  console.log("summarize — Tiny:");

  const tinyModel = TensorMiniMindModel.tiny(1024);
  const report: ModelStatsReport = ModelStats.summarize(tinyModel);

  // 1-4: Report structure
  assert(report.modelType === "TensorMiniMindModel", "report has modelType");
  assert(typeof report.totalParameters === "number", "report has totalParameters");
  assert(report.totalParameters > 0, "totalParameters > 0");
  assert(report.totalParameterObjects > 0, "totalParameterObjects > 0");

  // 5-7: Architecture summary
  assert(report.architecture.vocabSize === 1024, "architecture: vocabSize");
  assert(report.architecture.dModel === 128, "architecture: dModel");
  assert(report.architecture.numLayers === 2, "architecture: numLayers");

  // 8-10: Layer breakdown
  assert(report.layerBreakdown.length > 0, "layerBreakdown has entries");
  assert(report.layerBreakdown.some(l => l.name === "embedding"), "breakdown includes embedding");
  assert(report.layerBreakdown.some(l => l.name.includes("blocks.0")), "breakdown includes blocks.0");

  // 11-13: Memory estimates
  assert(report.memory.float64Bytes > 0, "memory: float64Bytes > 0");
  assert(report.memory.float64Bytes > report.memory.float32Bytes, "float64 > float32");
  assert(typeof report.memory.formatted.float64 === "string", "memory formatted is string");

  // 14-15: FLOPs
  assert(report.estimatedFlops > 0, "estimatedFlops > 0");
  assert(typeof report.estimatedFlops === "number", "estimatedFlops is number");

  // 16-17: Formatted summary
  assert(typeof report.formattedSummary === "string" && report.formattedSummary.length > 0,
    "formattedSummary is non-empty string");
  assert(report.formattedSummary.includes("TensorMiniMindModel"), "summary mentions model type");

  // ── summarize — Small model ──
  console.log("summarize — Small:");

  const smallModel = new TensorMiniMindModel({
    vocabSize: 1000, dModel: 256, numHeads: 8,
    dFF: 1024, numLayers: 6, maxSeqLen: 512,
  });
  const smallReport = ModelStats.summarize(smallModel);

  // 18-20: Small > Tiny
  assert(smallReport.totalParameters > report.totalParameters, "small has more params than tiny");
  assert(smallReport.architecture.dModel === 256, "small dModel = 256");
  assert(smallReport.architecture.numLayers === 6, "small numLayers = 6");

  // 21: Small has more layers in breakdown
  assert(
    smallReport.layerBreakdown.filter(l => l.name.startsWith("blocks.")).length >
    report.layerBreakdown.filter(l => l.name.startsWith("blocks.")).length,
    "small has more block layers than tiny"
  );

  // ── summarize — Base model ──
  console.log("summarize — Base:");

  const baseModel = new TensorMiniMindModel({
    vocabSize: 1000, dModel: 512, numHeads: 8,
    dFF: 2048, numLayers: 8, maxSeqLen: 512,
  });
  const baseReport = ModelStats.summarize(baseModel);

  // 22-23: Base > Small
  assert(baseReport.totalParameters > smallReport.totalParameters, "base has more params than small");
  assert(baseReport.architecture.dModel === 512, "base dModel = 512");

  // ── parameterCount ──
  console.log("parameterCount:");

  // 24-26: Count matches report
  const count = ModelStats.parameterCount(tinyModel);
  assert(count === report.totalParameters, "parameterCount matches report.totalParameters");
  assert(count > 100000, "tiny model has >100K parameters");

  // 27-28: Count increases with model size
  const smallCount = ModelStats.parameterCount(smallModel);
  assert(smallCount > count, "small has more params than tiny");

  // ── moduleParameterCount ──
  console.log("moduleParameterCount:");

  // 29-31: Count on Module instances
  const embedCount = ModelStats.moduleParameterCount(tinyModel.embedding);
  assert(embedCount > 0, "embedding has parameters");
  assert(embedCount < count, "embedding has fewer params than whole model");

  // 32: Count on a block
  const blockCount = ModelStats.moduleParameterCount(tinyModel.blocks[0]);
  assert(blockCount > 0, "transformer block has parameters");

  // ── parameterCountByGroup ──
  console.log("parameterCountByGroup:");

  // 33-36: Group counts
  const groups = ModelStats.parameterCountByGroup(tinyModel);
  assert(typeof groups === "object" && groups !== null, "parameterCountByGroup returns object");
  assert("embedding" in groups, "groups has embedding");
  assert("blocks.0" in groups, "groups has blocks.0");
  assert("blocks.1" in groups, "groups has blocks.1");

  // 37-38: All blocks have similar sizes
  const block0Size = groups["blocks.0"];
  const block1Size = groups["blocks.1"];
  assert(block0Size > 0 && block1Size > 0, "each block has parameters");
  assertClose(block0Size, block1Size, block0Size * 0.1, "blocks have similar parameter counts");

  // 39-40: Group sum equals total
  const groupSum = Object.values(groups).reduce((a, b) => a + b, 0);
  assert(groupSum === count, "group sum equals total parameter count");

  // ── trainableCount ──
  console.log("trainableCount:");

  // 41-43
  const tc = ModelStats.trainableCount(tinyModel);
  assert(typeof tc.trainable === "number", "trainableCount has trainable field");
  assert(tc.trainable > 0, "trainable params > 0");
  assert(tc.nonTrainable === 0, "all params are trainable in default model");
  assert(tc.trainable === count, "trainable count matches total");

  // ── parameterDetails ──
  console.log("parameterDetails:");

  // 44-47
  const details = ModelStats.parameterDetails(tinyModel);
  assert(details.length > 0, "parameterDetails returns non-empty array");
  assert(details[0].name.length > 0, "each detail has name");
  assert(details[0].shape.length > 0, "each detail has shape");
  assert(details.every(d => d.trainable === true), "all parameters are trainable");

  // 48-50: Details match named parameters
  const namedParams = tinyModel.namedParameters();
  assert(details.length === namedParams.length, "parameterDetails length matches namedParameters");
  assert(details[0].elements === namedParams[0].parameter.size, "first detail elements match");
  assert(details[details.length - 1].elements === namedParams[namedParams.length - 1].parameter.size,
    "last detail elements match");

  console.log(`\nModelStats: ${passed} passed, ${failed} failed\n`);
  return { passed, failed };
}

if (require.main === module) {
  runModelStatsTests();
}
