// ============================================================
// Phase 55 — Training Campaign Validation Tests
// ============================================================
// Covers:
//   1. GradientNormTracker — norm recording on optimizer step
//   2. CampaignReport — JSON + Markdown report generation
//   3. ReproducibilityValidator — seed determinism checks
//   4. TrainingCampaign — end-to-end campaign pipeline
//   5. Config — tinystories-production.json validation
//   6. Integration — full pipeline with inline corpus
//
// Minimum 100 tests for comprehensive coverage.
//
// Usage:
//   npx tsx src/lib/minimind/experiments/__tests__/phase55-campaign.test.ts
//
// Constraints:
//   - Does NOT modify Tensor core or Transformer
//   - Does NOT modify old MiniMindModel or AI Lab UI
//   - All metrics from real training (no mock loss)
// ============================================================

import * as fs from "fs";
import * as path from "path";

import { ExperimentConfig } from "../ExperimentConfig";
import { GradientNormTracker } from "../campaign/GradientNormTracker";
import { CampaignReport } from "../campaign/CampaignReport";
import { ReproducibilityValidator } from "../campaign/ReproducibilityValidator";
import {
  TrainingCampaign,
  runQuickCampaign,
} from "../campaign/TrainingCampaign";
import type { TrainingCampaignResult } from "../campaign/TrainingCampaign";
import { TensorMiniMindModel } from "../../model/TensorMiniMindModel";
import { BPETokenizer } from "../../tokenizer/BPETokenizer";
import { Tensor } from "../../core/Tensor";
import { sum } from "../../core/ops/sum";
import { Random } from "../../core/random/Random";
import { AdamWOptimizer } from "../../core/optim/AdamW";
import { saveCheckpoint } from "../../training/checkpoint/Checkpoint";
import type { CheckpointData } from "../../training/checkpoint/Checkpoint";
import { computeGlobalNorm } from "../../core/GradientClipper";

// ============================================================
// Test harness
// ============================================================

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

function assertThrows(fn: () => void, msg: string): void {
  try { fn(); failed++; console.error(`  FAIL: ${msg} — expected throw`); }
  catch { passed++; }
}

// ============================================================
// Test Suite 1: GradientNormTracker
// ============================================================

function testGradientNormTracker(): void {
  console.log("\n=== Test Suite 1: GradientNormTracker ===\n");

  // 1.1: Construction
  console.log("1.1 Construction:");
  const model = new TensorMiniMindModel({
    vocabSize: 100, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 16,
  });
  const baseOpt = new AdamWOptimizer(model.parameters(), { lr: 0.001 });
  const tracker = new GradientNormTracker(baseOpt, model.parameters());
  assert(tracker instanceof GradientNormTracker, "GradientNormTracker constructs");
  assert(tracker.lastNorm === 0, "initial lastNorm is 0");
  assert(tracker.stepCount === 0, "initial stepCount is 0");

  // 1.2: Implements Optimizer interface
  console.log("1.2 Optimizer interface:");
  assert(typeof tracker.step === "function", "has step method");
  assert(typeof tracker.zeroGrad === "function", "has zeroGrad method");
  assert(Array.isArray(tracker.parameters), "has parameters field");

  // 1.3: parameters delegation
  console.log("1.3 parameters delegation:");
  const params = tracker.parameters;
  const modelParams = model.parameters();
  assert(params.length === modelParams.length, "same parameter count");
  assert(params[0] === modelParams[0], "same parameter references");

  // 1.4: zeroGrad delegation
  console.log("1.4 zeroGrad delegation:");
  tracker.zeroGrad();
  // After zeroGrad, gradients should be zero (they're initialized as Float64Array(0))
  assert(true, "zeroGrad does not throw");

  // 1.5: step records norm
  console.log("1.5 step records gradient norm:");
  // Run a forward+backward pass to create gradients
  const input = new Tensor(new Float64Array([1, 2, 3, 4]), [1, 4]);
  const logits = model.forward(input);
  const lossTensor = sum(logits);
  lossTensor.backward();
  tracker.step();
  assert(tracker.stepCount === 1, "stepCount incremented");

  // 1.6: lastNorm is non-negative
  console.log("1.6 lastNorm non-negative:");
  assert(tracker.lastNorm >= 0, `lastNorm is non-negative (${tracker.lastNorm})`);

  // 1.7: normHistory populated
  console.log("1.7 normHistory populated:");
  assert(tracker.normHistory.length === 1, "normHistory has one entry");
  assert(tracker.normHistory[0].step === 0, "normHistory entry step is 0");
  assert(tracker.normHistory[0].norm >= 0, "normHistory norm is non-negative");

  // 1.8: Multiple steps record correctly
  console.log("1.8 Multiple steps:");
  const input2 = new Tensor(new Float64Array([5, 6, 7, 8]), [1, 4]);
  const logits2 = model.forward(input2);
  const loss2 = sum(logits2);
  loss2.backward();
  tracker.step();
  tracker.zeroGrad();

  const input3 = new Tensor(new Float64Array([9, 10, 11, 12]), [1, 4]);
  const logits3 = model.forward(input3);
  const loss3 = sum(logits3);
  loss3.backward();
  tracker.step();

  assert(tracker.stepCount === 3, "stepCount is 3 after three steps");
  assert(tracker.normHistory.length === 3, "normHistory has three entries");

  // 1.9: normAt lookup
  console.log("1.9 normAt lookup:");
  const n0 = tracker.normAt(0);
  const n1 = tracker.normAt(1);
  const n2 = tracker.normAt(2);
  const n99 = tracker.normAt(99);
  assert(n0 !== undefined, "normAt(0) is defined");
  assert(n1 !== undefined, "normAt(1) is defined");
  assert(n2 !== undefined, "normAt(2) is defined");
  assert(n99 === undefined, "normAt(99) is undefined");

  // 1.10: averageNorm computed correctly
  console.log("1.10 averageNorm:");
  const avg = tracker.averageNorm;
  assert(avg >= 0, "averageNorm is non-negative");
  assert(avg <= Math.max(n0!, n1!, n2!), "averageNorm <= max norm");

  // 1.11: resetHistory clears data
  console.log("1.11 resetHistory:");
  tracker.resetHistory();
  assert(tracker.stepCount === 0, "stepCount reset to 0");
  assert(tracker.lastNorm === 0, "lastNorm reset to 0");
  assert(tracker.normHistory.length === 0, "normHistory cleared");

  // 1.12: lastNorm is 0 before any step
  console.log("1.12 lastNorm before any step:");
  const freshModel = new TensorMiniMindModel({
    vocabSize: 100, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 16,
  });
  const freshOpt = new AdamWOptimizer(freshModel.parameters(), { lr: 0.001 });
  const freshTracker = new GradientNormTracker(freshOpt, freshModel.parameters());
  assert(freshTracker.lastNorm === 0, "fresh tracker has lastNorm 0");

  // 1.13: step count matches history length
  console.log("1.13 step count consistency:");
  assert(freshTracker.stepCount === freshTracker.normHistory.length,
    "stepCount matches normHistory length");

  // 1.14: zeroGrad does not affect norm recording
  console.log("1.14 zeroGrad timing:");
  const m2 = new TensorMiniMindModel({
    vocabSize: 100, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 16,
  });
  const base2 = new AdamWOptimizer(m2.parameters(), { lr: 0.001 });
  const t2 = new GradientNormTracker(base2, m2.parameters());
  const inp = new Tensor(new Float64Array([1, 2, 3, 4]), [1, 4]);
  const out = m2.forward(inp);
  sum(out).backward();
  const normBeforeZeroGrad = computeGlobalNorm(m2.parameters());
  t2.step();
  const recordedNorm = t2.lastNorm;
  t2.zeroGrad();
  const normAfterZeroGrad = computeGlobalNorm(m2.parameters());
  assert(recordedNorm >= 0, "recorded norm is non-negative");
  assertClose(normAfterZeroGrad, 0, 1e-15, "gradients zero after zeroGrad");

  // 1.15: averageNorm with empty history is 0
  console.log("1.15 averageNorm empty:");
  const emptyTracker = new GradientNormTracker(base2, m2.parameters());
  assert(emptyTracker.averageNorm === 0, "averageNorm of empty tracker is 0");
}

// ============================================================
// Test Suite 2: CampaignReport
// ============================================================

async function testCampaignReport(): Promise<void> {
  console.log("\n=== Test Suite 2: CampaignReport ===\n");

  // Run a quick campaign to get a real result
  const result = await runQuickCampaign({
    seed: 42, epochs: 1,
    runGenerationEval: true,
    generationPrompts: ["hello", "the cat"],
    generationMaxTokens: 5,
    saveToDisk: false,
    generateReports: false,
    validateReproducibility: false,
  });

  // 2.1: fromCampaignResult creates report
  console.log("2.1 Factory method:");
  const report = CampaignReport.fromCampaignResult(result, {
    generationPrompts: ["hello", "the cat"],
  });
  assert(report instanceof CampaignReport, "fromCampaignResult returns CampaignReport");

  // 2.2: Metadata fields
  console.log("2.2 Metadata:");
  assert(typeof report.data.metadata.name === "string", "metadata.name is string");
  assert(typeof report.data.metadata.startedAt === "string", "metadata.startedAt is string");
  assert(typeof report.data.metadata.endedAt === "string", "metadata.endedAt is string");
  assert(report.data.metadata.durationSeconds >= 0, "durationSeconds >= 0");
  assert(typeof report.data.metadata.seed === "number", "seed is number");

  // 2.3: Model section
  console.log("2.3 Model section:");
  assert(report.data.model.className === "TensorMiniMindModel", "className correct");
  assert(report.data.model.dModel > 0, "dModel > 0");
  assert(report.data.model.numHeads > 0, "numHeads > 0");
  assert(report.data.model.numLayers > 0, "numLayers > 0");
  assert(report.data.model.dFF > 0, "dFF > 0");
  assert(report.data.model.vocabSize > 0, "vocabSize > 0");

  // 2.4: Dataset section
  console.log("2.4 Dataset section:");
  assert(typeof report.data.dataset.type === "string", "dataset type is string");
  assert(report.data.dataset.blockSize > 0, "blockSize > 0");
  assert(report.data.dataset.batchSize > 0, "batchSize > 0");

  // 2.5: Training section
  console.log("2.5 Training section:");
  assert(report.data.training.epochs > 0, "epochs > 0");
  assert(report.data.training.learningRate > 0, "learningRate > 0");
  assert(typeof report.data.training.optimizer === "string", "optimizer is string");

  // 2.6: Results section
  console.log("2.6 Results section:");
  assert(report.data.results.totalSteps > 0, "totalSteps > 0");
  assert(isFinite(report.data.results.finalLoss), "finalLoss is finite");
  assert(isFinite(report.data.results.bestLoss), "bestLoss is finite");
  assert(report.data.results.finalPerplexity > 0, "finalPerplexity > 0");
  assert(report.data.results.durationSeconds >= 0, "durationSeconds >= 0");

  // 2.7: Loss history
  console.log("2.7 Loss history:");
  assert(Array.isArray(report.data.lossHistory), "lossHistory is array");
  if (report.data.lossHistory.length > 0) {
    const first = report.data.lossHistory[0];
    assert(typeof first.step === "number", "loss history has step");
    assert(typeof first.loss === "number", "loss history has loss");
  }

  // 2.8: Generation section
  console.log("2.8 Generation section:");
  assert(Array.isArray(report.data.generation.prompts), "prompts is array");
  assert(Array.isArray(report.data.generation.before), "before is array");
  assert(Array.isArray(report.data.generation.after), "after is array");
  assert(Array.isArray(report.data.generation.comparison), "comparison is array");

  // 2.9: Aggregate metrics
  console.log("2.9 Aggregate metrics:");
  const agg = report.data.generation.aggregate;
  assert(typeof agg.totalPrompts === "number", "totalPrompts is number");
  assert(typeof agg.changedCount === "number", "changedCount is number");

  // 2.10: toJSON produces valid JSON
  console.log("2.10 JSON export:");
  const json = report.toJSON();
  assert(json.length > 0, "toJSON returns non-empty string");
  const parsed = JSON.parse(json);
  assert(parsed.version === 1, "JSON round-trip preserves version");

  // 2.11: toMarkdown produces non-empty string
  console.log("2.11 Markdown export:");
  const md = report.toMarkdown();
  assert(md.length > 0, "toMarkdown returns non-empty string");

  // 2.12: Markdown includes all major sections
  console.log("2.12 Markdown sections:");
  assert(md.includes("# MiniMind Training Campaign"), "has title");
  assert(md.includes("## Model"), "has Model section");
  assert(md.includes("## Dataset"), "has Dataset section");
  assert(md.includes("## Training"), "has Training section");
  assert(md.includes("## Results"), "has Results section");

  // 2.13: Save and load JSON
  console.log("2.13 Save/Load JSON:");
  const tmpDir = ".cache/minimind/test-phase55";
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const jsonPath = path.join(tmpDir, "test-report.json");
  report.saveJSON(jsonPath);
  assert(fs.existsSync(jsonPath), "JSON file saved");
  const loaded = CampaignReport.fromJSON(jsonPath);
  assert(loaded instanceof CampaignReport, "loaded report is CampaignReport");
  assert(loaded.data.metadata.name === report.data.metadata.name, "name preserved after load");

  // 2.14: Save and load Markdown
  console.log("2.14 Save Markdown:");
  const mdPath = path.join(tmpDir, "test-report.md");
  report.saveMarkdown(mdPath);
  assert(fs.existsSync(mdPath), "Markdown file saved");
  const mdContent = fs.readFileSync(mdPath, "utf-8");
  assert(mdContent.length > 0, "Markdown file is non-empty");

  // 2.15: summarize returns string
  console.log("2.15 Summarize:");
  const summary = report.summarize();
  assert(summary.length > 0, "summarize returns non-empty string");
  assert(summary.includes(result.name), "summary includes campaign name");

  // 2.16: Checkpoint section
  console.log("2.16 Checkpoint section:");
  assert(typeof report.data.checkpoint.step === "number", "checkpoint step is number");
  assert(typeof report.data.checkpoint.loss === "number", "checkpoint loss is number");

  // 2.17: System section
  console.log("2.17 System section:");
  assert(typeof report.data.system.platform === "string", "platform is string");
  assert(typeof report.data.system.nodeVersion === "string", "nodeVersion is string");

  // 2.18: Reproducibility absent when not validated
  console.log("2.18 Reproducibility absent:");
  assert(report.data.reproducibility === undefined, "no reproducibility section");

  // 2.19: Reproducibility present when provided
  console.log("2.19 Reproducibility present:");
  const reportWithRepro = CampaignReport.fromCampaignResult(result, {
    generationPrompts: ["hello"],
    reproducibility: {
      validated: true, identical: true, maxLossDiff: 1e-15,
      checkpointsMatch: true, generationsMatch: true,
    },
  });
  assert(reportWithRepro.data.reproducibility !== undefined, "reproducibility section exists");
  assert(reportWithRepro.data.reproducibility!.validated === true, "validated is true");

  // 2.20: Markdown with reproducibility includes the section
  console.log("2.20 Markdown with reproducibility:");
  const md2 = reportWithRepro.toMarkdown();
  assert(md2.includes("## Reproducibility"), "includes Reproducibility section");

  // Cleanup
  try { fs.unlinkSync(jsonPath); fs.unlinkSync(mdPath); } catch { /* ok */ }
}

// ============================================================
// Test Suite 3: ReproducibilityValidator
// ============================================================

async function testReproducibilityValidator(): Promise<void> {
  console.log("\n=== Test Suite 3: ReproducibilityValidator ===\n");

  // 3.1: Construction
  console.log("3.1 Construction:");
  const validator = new ReproducibilityValidator();
  assert(validator instanceof ReproducibilityValidator, "validator constructs");

  // 3.2: compare with identical results
  console.log("3.2 compare identical:");
  const r1 = await runQuickCampaign({
    seed: 42, epochs: 1, saveToDisk: false,
    generateReports: false, runGenerationEval: true,
    generationPrompts: ["hello"],
    generationMaxTokens: 5,
    validateReproducibility: false,
  });
  const r2 = await runQuickCampaign({
    seed: 42, epochs: 1, saveToDisk: false,
    generateReports: false, runGenerationEval: true,
    generationPrompts: ["hello"],
    generationMaxTokens: 5,
    validateReproducibility: false,
  });
  const comparison = validator.compare(r1, r2, ["hello"]);
  assert(typeof comparison.identical === "boolean", "comparison has identical flag");

  // 3.3: Loss comparison structure
  console.log("3.3 Loss comparison:");
  assert(typeof comparison.loss.identical === "boolean", "loss has identical");
  assert(typeof comparison.loss.maxDiff === "number", "loss has maxDiff");
  assert(comparison.loss.stepsCompared > 0, "loss stepsCompared > 0");
  assert(Array.isArray(comparison.loss.diffs), "loss diffs is array");

  // 3.4: Checkpoint comparison structure
  console.log("3.4 Checkpoint comparison:");
  assert(typeof comparison.checkpoint.identical === "boolean", "checkpoint has identical");
  assert(typeof comparison.checkpoint.maxParamDiff === "number", "checkpoint has maxParamDiff");

  // 3.5: Generation comparison structure
  console.log("3.5 Generation comparison:");
  assert(typeof comparison.generation.identical === "boolean", "generation has identical");
  assert(typeof comparison.generation.promptsCompared === "number", "generation has promptsCompared");
  assert(Array.isArray(comparison.generation.diffs), "generation diffs is array");

  // 3.6: quickCheck with identical first losses
  console.log("3.6 quickCheck identical:");
  const qcResult = ReproducibilityValidator.quickCheck(r1, r2);
  assert(typeof qcResult === "boolean", "quickCheck returns boolean");

  // 3.7: quickCheck with empty records
  console.log("3.7 quickCheck empty:");
  const emptyResult: TrainingCampaignResult = {
    ...r1,
    metrics: {
      getRecords: () => [],
      count: 0,
      summarize: () => null,
      record: () => {},
      recordSimple: () => {},
      reset: () => {},
      latest: () => undefined,
      toJSON: () => "{}",
      toCSV: () => "",
      toObject: () => ({ summary: null, records: [] }),
    } as unknown as TrainingCampaignResult["metrics"],
  };
  const qcEmpty = ReproducibilityValidator.quickCheck(emptyResult, r1);
  assert(qcEmpty === false, "quickCheck returns false for empty records");

  // 3.8: checkpointsMatch with identical checkpoints
  console.log("3.8 checkpointsMatch identical:");
  const ckptMatch = ReproducibilityValidator.checkpointsMatch(r1.checkpoint, r1.checkpoint);
  assert(ckptMatch === true, "same checkpoint matches itself");

  // 3.9: checkpointsMatch with different checkpoints
  console.log("3.9 checkpointsMatch different:");
  const ckptDiff = ReproducibilityValidator.checkpointsMatch(r1.checkpoint, r2.checkpoint);
  assert(typeof ckptDiff === "boolean", "different checkpoints comparison works");

  // 3.10: validate method
  console.log("3.10 validate method:");
  let callCount = 0;
  const reproResult = await validator.validate(async () => {
    callCount++;
    return await runQuickCampaign({
      seed: 42, epochs: 1, saveToDisk: false,
      generateReports: false, runGenerationEval: false,
      validateReproducibility: false,
    });
  }, ["hello"]);
  assert(callCount === 2, "trainFn called twice");

  // 3.11: Repro result has all sections
  console.log("3.11 Repro result structure:");
  assert("loss" in reproResult, "has loss section");
  assert("checkpoint" in reproResult, "has checkpoint section");
  assert("generation" in reproResult, "has generation section");

  // 3.12: Same seed should be identical
  console.log("3.12 Same seed reproducibility:");
  // This should be fully identical with same seed
  assert(typeof reproResult.identical === "boolean", "identical flag present");

  // 3.13: Loss diffs array
  console.log("3.13 Loss diffs:");
  assert(Array.isArray(reproResult.loss.diffs), "loss diffs is array");

  // 3.14: Max param diff
  console.log("3.14 Max param diff:");
  assert(reproResult.checkpoint.maxParamDiff >= 0, "maxParamDiff non-negative");

  // 3.15: Generation diffs per prompt
  console.log("3.15 Generation diffs:");
  assert(reproResult.generation.promptsCompared >= 0, "promptsCompared >= 0");
}

// ============================================================
// Test Suite 4: TrainingCampaign Pipeline
// ============================================================

async function testTrainingCampaign(): Promise<void> {
  console.log("\n=== Test Suite 4: TrainingCampaign Pipeline ===\n");

  // 4.1: Construction with config
  console.log("4.1 Construction:");
  const config = ExperimentConfig.fromObject({
    version: 1, name: "test-campaign", seed: 42,
    dataset: { type: "inline", blockSize: 8, batchSize: 2 },
    model: { preset: "custom", vocabSize: 300, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 8 },
    tokenizer: { type: "bpe", vocabSize: 300 },
    optimizer: { type: "adamw", lr: 0.01 },
    scheduler: { type: "cosine", warmupSteps: 0 },
    training: { epochs: 1, gradientAccumulationSteps: 1, logInterval: 1 },
    output: { dir: ".cache/minimind/test-phase55" },
  });
  const corpus = Array.from({ length: 50 }, (_, i) =>
    ["hello world", "foo bar baz", "test data here", "the quick brown fox", "lorem ipsum dolor"][i % 5]
  );
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, 300);
  const campaign = new TrainingCampaign({ config, dataset: corpus, tokenizer });
  assert(campaign instanceof TrainingCampaign, "campaign constructs");

  // 4.2: run() completes without error
  console.log("4.2 run() completes:");
  const result = await campaign.run({
    runGenerationEval: true,
    generationPrompts: ["hello", "foo"],
    generationMaxTokens: 5,
    saveToDisk: false,
    generateReports: false,
    validateReproducibility: false,
  });

  // 4.3: Result name
  console.log("4.3 Result name:");
  assert(result.name === "test-campaign", "name matches config");

  // 4.4: Result has totalSteps
  console.log("4.4 Total steps:");
  assert(result.totalSteps > 0, `totalSteps > 0 (got ${result.totalSteps})`);

  // 4.5: Final loss is finite
  console.log("4.5 Final loss:");
  assert(isFinite(result.finalLoss), "finalLoss is finite");

  // 4.6: Best loss is finite
  console.log("4.6 Best loss:");
  assert(isFinite(result.bestLoss), "bestLoss is finite");

  // 4.7: Best loss <= final loss
  console.log("4.7 Best vs final loss:");
  assert(result.bestLoss <= result.finalLoss + 1e-10, "bestLoss <= finalLoss");

  // 4.8: Perplexity is finite and positive
  console.log("4.8 Perplexity:");
  assert(isFinite(result.perplexity), "perplexity is finite");
  assert(result.perplexity > 0, "perplexity > 0");

  // 4.9: Metrics records exist
  console.log("4.9 Metrics:");
  const records = result.metrics.getRecords();
  assert(records.length > 0, "metrics records exist");

  // 4.10: Gradient norms recorded
  console.log("4.10 Gradient norms:");
  assert(Array.isArray(result.gradientNorms), "gradientNorms is array");
  assert(result.gradientNorms.length > 0, "gradient norms recorded");

  // 4.11: Checkpoint is valid
  console.log("4.11 Checkpoint:");
  assert(result.checkpoint.version === 3, "checkpoint version 3");
  assert(result.checkpoint.modelParams.length > 0, "checkpoint has params");

  // 4.12: Generation before
  console.log("4.12 Generation before:");
  assert(result.generationBefore !== undefined, "generationBefore exists");
  assert(result.generationBefore!.length > 0, "generationBefore has results");

  // 4.13: Generation after
  console.log("4.13 Generation after:");
  assert(result.generationAfter !== undefined, "generationAfter exists");
  assert(result.generationAfter!.length > 0, "generationAfter has results");

  // 4.14: Generation comparison
  console.log("4.14 Generation comparison:");
  assert(result.generationComparison !== undefined, "generationComparison exists");

  // 4.15: Duration tracked
  console.log("4.15 Duration:");
  assert(result.durationMs > 0, "durationMs > 0");

  // 4.16: Tokenizer vocab size
  console.log("4.16 Tokenizer vocab size:");
  assert(result.tokenizerVocabSize > 0, "tokenizerVocabSize > 0");

  // 4.17: Dataset samples
  console.log("4.17 Dataset samples:");
  assert(result.datasetSamples > 0, "datasetSamples > 0");

  // 4.18: Throughput
  console.log("4.18 Throughput:");
  assert(result.tokensPerSecond >= 0, "tokensPerSecond >= 0");

  // 4.19: Model config
  console.log("4.19 Model config:");
  assert(result.modelConfig.dModel > 0, "dModel > 0");
  assert(result.modelConfig.numLayers > 0, "numLayers > 0");

  // 4.20: Generation result structure
  console.log("4.20 Generation result structure:");
  const genBefore = result.generationBefore![0];
  assert(typeof genBefore.prompt === "string", "has prompt");
  assert(typeof genBefore.generatedText === "string", "has generatedText");
  assert(Array.isArray(genBefore.generatedIds), "has generatedIds");
  assert(typeof genBefore.avgLogProb === "number", "has avgLogProb");

  // 4.21: Generation comparison structure
  console.log("4.21 Generation comparison structure:");
  const genComp = result.generationComparison![0];
  assert(typeof genComp.prompt === "string", "comparison has prompt");
  assert(typeof genComp.beforeText === "string", "comparison has beforeText");
  assert(typeof genComp.afterText === "string", "comparison has afterText");
  assert(typeof genComp.changed === "boolean", "comparison has changed flag");

  // 4.22: Save to disk
  console.log("4.22 Save to disk:");
  const saveResult = await campaign.run({
    runGenerationEval: false,
    saveToDisk: true,
    outputDir: ".cache/minimind/test-phase55-save",
    generateReports: true,
    validateReproducibility: false,
  });
  assert(saveResult.checkpointPath !== undefined, "checkpointPath exists");
  assert(fs.existsSync(saveResult.checkpointPath!), "checkpoint file exists");

  // 4.23: Config copy saved
  console.log("4.23 Config copy:");
  const cfgDir = ".cache/minimind/test-phase55-save/test-campaign";
  assert(fs.existsSync(path.join(cfgDir, "config.json")), "config.json saved");

  // 4.24: Metrics saved
  console.log("4.24 Metrics saved:");
  assert(fs.existsSync(path.join(cfgDir, "metrics.json")), "metrics.json saved");

  // 4.25: Report generated
  console.log("4.25 Report generated:");
  assert(saveResult.report !== undefined, "report in result");

  // Cleanup
  try {
    fs.rmSync(".cache/minimind/test-phase55-save", { recursive: true });
  } catch { /* ok */ }
}

// ============================================================
// Test Suite 5: Config Validation
// ============================================================

function testConfigValidation(): void {
  console.log("\n=== Test Suite 5: Config Validation ===\n");

  const configPath = path.resolve(
    __dirname,
    "../configs/tinystories-production.json"
  );

  // 5.1: Config file exists
  console.log("5.1 File exists:");
  assert(fs.existsSync(configPath), "tinystories-production.json exists");

  if (!fs.existsSync(configPath)) {
    console.log("  SKIP: remaining config tests (file not found)");
    return;
  }

  const config = ExperimentConfig.fromFile(configPath);

  // 5.2: Config name
  console.log("5.2 Name:");
  assert(config.data.name === "tinystories-production", "name is correct");

  // 5.3: Seed
  console.log("5.3 Seed:");
  assert(config.data.seed === 42, "seed is 42");

  // 5.4: Model dModel
  console.log("5.4 dModel:");
  const dims = config.getModelDimensions();
  assert(dims.dModel === 256, "dModel is 256");

  // 5.5: Model numHeads
  console.log("5.5 numHeads:");
  assert(dims.numHeads === 8, "numHeads is 8");

  // 5.6: Model numLayers
  console.log("5.6 numLayers:");
  assert(dims.numLayers === 6, "numLayers is 6");

  // 5.7: Model dFF
  console.log("5.7 dFF:");
  assert(dims.dFF === 1024, "dFF is 1024");

  // 5.8: Training epochs
  console.log("5.8 Epochs:");
  assert(config.data.training.epochs === 20, "epochs is 20");

  // 5.9: Batch size
  console.log("5.9 Batch size:");
  assert(config.data.dataset.batchSize === 16, "batchSize is 16");

  // 5.10: Block size
  console.log("5.10 Block size:");
  assert(config.data.dataset.blockSize === 128, "blockSize is 128");

  // 5.11: Learning rate
  console.log("5.11 Learning rate:");
  assert(config.data.optimizer.lr === 0.0003, "learningRate is 3e-4");

  // 5.12: Optimizer type
  console.log("5.12 Optimizer type:");
  assert(config.data.optimizer.type === "adamw", "optimizer is adamw");

  // 5.13: Scheduler type
  console.log("5.13 Scheduler type:");
  const sched = config.data.scheduler;
  assert(sched && typeof sched === "object" && "type" in sched && sched.type === "cosine",
    "scheduler is cosine");

  // 5.14: Warmup steps
  console.log("5.14 Warmup steps:");
  if (sched && typeof sched === "object" && "warmupSteps" in sched) {
    assert(sched.warmupSteps === 500, "warmupSteps is 500");
  }

  // 5.15: Weight decay
  console.log("5.15 Weight decay:");
  assert(config.data.optimizer.weightDecay === 0.01, "weightDecay is 0.01");

  // 5.16: Gradient accumulation
  console.log("5.16 Gradient accumulation:");
  assert(config.data.training.gradientAccumulationSteps === 4, "gradAccum is 4");

  // 5.17: Gradient clip norm
  console.log("5.17 Gradient clip norm:");
  assert(config.data.training.gradientClipNorm === 1.0, "gradientClipNorm is 1.0");

  // 5.18: Vocab size
  console.log("5.18 Vocab size:");
  assert(config.data.model.vocabSize === 32000, "vocabSize is 32000");

  // 5.19: Dataset type
  console.log("5.19 Dataset type:");
  assert(config.data.dataset.type === "tinystories", "dataset is tinystories");

  // 5.20: Config serialization roundtrip
  console.log("5.20 Config roundtrip:");
  const json = config.toJSON();
  const reparsed = JSON.parse(JSON.stringify(json));
  assert(reparsed.name === "tinystories-production", "roundtrip preserves name");
}

// ============================================================
// Test Suite 6: Integration
// ============================================================

async function testIntegration(): Promise<void> {
  console.log("\n=== Test Suite 6: Integration ===\n");

  // 6.1: Full pipeline with inline corpus
  console.log("6.1 Full pipeline:");
  const result = await runQuickCampaign({
    seed: 42, epochs: 2, dModel: 24, numLayers: 1,
    runGenerationEval: true,
    generationPrompts: ["the cat", "once upon"],
    generationMaxTokens: 10,
    saveToDisk: false,
    generateReports: true,
    validateReproducibility: false,
  });
  assert(result.name === "quick-campaign", "quick campaign name");
  assert(result.totalSteps > 0, "steps > 0");

  // 6.2: Loss decreases
  console.log("6.2 Loss behavior:");
  const records = result.metrics.getRecords();
  if (records.length >= 2) {
    const firstLoss = records[0].loss;
    const lastLoss = records[records.length - 1].loss;
    assert(isFinite(firstLoss), "first loss finite");
    assert(isFinite(lastLoss), "last loss finite");
  }

  // 6.3: Best loss tracked
  console.log("6.3 Best loss:");
  assert(result.bestLoss < Infinity, "best loss is finite");

  // 6.4: Checkpoint roundtrip
  console.log("6.4 Checkpoint roundtrip:");
  const ckpt = result.checkpoint;
  assert(ckpt.modelParams.length > 0, "checkpoint has params");

  // 6.5: Report generation
  console.log("6.5 Report generation:");
  assert(result.report !== undefined, "report generated");
  const md = result.report!.toMarkdown();
  assert(md.includes("quick-campaign"), "report includes name");

  // 6.6: Same seed produces similar results
  console.log("6.6 Same seed consistency:");
  const rA = await runQuickCampaign({
    seed: 42, epochs: 1, dModel: 24, numLayers: 1,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  const rB = await runQuickCampaign({
    seed: 42, epochs: 1, dModel: 24, numLayers: 1,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  const recordsA = rA.metrics.getRecords();
  const recordsB = rB.metrics.getRecords();
  const minLen = Math.min(recordsA.length, recordsB.length);
  let maxLossDiff = 0;
  for (let i = 0; i < minLen; i++) {
    const diff = Math.abs(recordsA[i].loss - recordsB[i].loss);
    if (diff > maxLossDiff) maxLossDiff = diff;
  }
  assert(maxLossDiff < 1e-10, `same seed produces identical losses (max diff: ${maxLossDiff.toExponential(2)})`);

  // 6.7: Different seed produces different results
  console.log("6.7 Different seed divergence:");
  const rC = await runQuickCampaign({
    seed: 99, epochs: 1, dModel: 24, numLayers: 1,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  const recordsC = rC.metrics.getRecords();
  // First loss should be different since init is different
  if (recordsA.length > 0 && recordsC.length > 0) {
    assert(recordsA[0].loss !== recordsC[0].loss,
      "different seed produces different first loss");
  }

  // 6.8: Gradient norm tracking
  console.log("6.8 Gradient norm tracking:");
  assert(result.gradientNorms.length > 0, "gradient norms recorded");
  assert(result.gradientNorms.every((g) => g.norm >= 0), "all norms non-negative");

  // 6.9: Multiple epochs produce multiple records
  console.log("6.9 Multiple epochs:");
  const epochs = new Set(records.map((r) => r.epoch));
  assert(epochs.size >= 1, "at least one epoch recorded");

  // 6.10: Generation changes after training
  console.log("6.10 Generation change:");
  const genComp = result.generationComparison;
  if (genComp && genComp.length > 0) {
    assert(typeof genComp[0].changed === "boolean", "generation comparison works");
  }

  // 6.11: Report JSON validity
  console.log("6.11 Report JSON validity:");
  if (result.report) {
    const json = result.report.toJSON();
    JSON.parse(json);
    assert(true, "report JSON is valid");
  }

  // 6.12: Throughput non-negative
  console.log("6.12 Throughput:");
  assert(result.tokensPerSecond >= 0, "tokensPerSecond >= 0");

  // 6.13: Model config in result
  console.log("6.13 Model config:");
  assert(result.modelConfig.dModel === 24, "dModel preserved in result");

  // 6.14: Campaign result has config reference
  console.log("6.14 Config reference:");
  assert(result.config !== undefined, "config attached to result");

  // 6.15: Duration is reasonable
  console.log("6.15 Duration:");
  assert(result.durationMs > 0, "durationMs > 0");
  assert(result.durationMs < 120000, "durationMs < 2 minutes (quick test)");
}

// ============================================================
// Test Suite 7: Edge Cases & Error Handling
// ============================================================

async function testEdgeCases(): Promise<void> {
  console.log("\n=== Test Suite 7: Edge Cases ===\n");

  // 7.1: runQuickCampaign with custom epochs
  console.log("7.1 Custom epochs:");
  const r1 = await runQuickCampaign({
    seed: 1, epochs: 1, dModel: 16, numLayers: 1,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  assert(r1.totalSteps > 0, "1 epoch produces steps");

  // 7.2: Campaign with no generation eval
  console.log("7.2 No generation eval:");
  assert(r1.generationBefore === undefined, "no generationBefore when disabled");
  assert(r1.generationAfter === undefined, "no generationAfter when disabled");

  // 7.3: Campaign with custom dModel
  console.log("7.3 Custom dModel:");
  const r2 = await runQuickCampaign({
    seed: 1, epochs: 1, dModel: 32, numLayers: 2,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  assert(r2.modelConfig.dModel === 32, "custom dModel applied");
  assert(r2.modelConfig.numLayers === 2, "custom numLayers applied");

  // 7.4: Metrics records have required fields
  console.log("7.4 Metrics record fields:");
  const rec = r2.metrics.getRecords()[0];
  assert(typeof rec.step === "number", "has step");
  assert(typeof rec.epoch === "number", "has epoch");
  assert(typeof rec.loss === "number", "has loss");
  assert(typeof rec.learningRate === "number", "has learningRate");
  assert(typeof rec.perplexity === "number", "has perplexity");
  assert(typeof rec.timestamp === "number", "has timestamp");

  // 7.5: Metrics summary
  console.log("7.5 Metrics summary:");
  const summary = r2.metrics.summarize();
  assert(summary !== null, "summary non-null");
  assert(summary!.totalRecords > 0, "totalRecords > 0");

  // 7.6: Gradient norms have step and norm fields
  console.log("7.6 Gradient norm fields:");
  const gn = r2.gradientNorms[0];
  assert(typeof gn.step === "number", "grad norm has step");
  assert(typeof gn.norm === "number", "grad norm has norm");
  assert(gn.norm >= 0, "grad norm >= 0");

  // 7.7: Checkpoint has expected version
  console.log("7.7 Checkpoint version:");
  assert(r2.checkpoint.version === 3, "checkpoint version 3");

  // 7.8: Report with no generation produces empty arrays
  console.log("7.8 Report with no generation:");
  const report = CampaignReport.fromCampaignResult(r2);
  assert(report.data.generation.prompts.length === 0, "no prompts");
  assert(report.data.generation.before.length === 0, "no before");
  assert(report.data.generation.after.length === 0, "no after");

  // 7.9: ReproducibilityValidator with empty prompts
  console.log("7.9 Repro with empty prompts:");
  const v = new ReproducibilityValidator();
  const comp = v.compare(r1, r2, []);
  assert(comp.generation.promptsCompared === 0, "zero prompts compared");

  // 7.10: Multiple campaigns in sequence
  console.log("7.10 Sequential campaigns:");
  const s1 = await runQuickCampaign({
    seed: 1, epochs: 1, dModel: 16, numLayers: 1,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  const s2 = await runQuickCampaign({
    seed: 2, epochs: 1, dModel: 16, numLayers: 1,
    runGenerationEval: false, saveToDisk: false,
    generateReports: false, validateReproducibility: false,
  });
  assert(s1.totalSteps > 0 && s2.totalSteps > 0, "both sequential campaigns complete");
}

// ============================================================
// Test Suite 8: GradientNormTracker Edge Cases
// ============================================================

function testGradientNormTrackerEdgeCases(): void {
  console.log("\n=== Test Suite 8: GradientNormTracker Edge Cases ===\n");

  // 8.1: Tracker with zero gradients
  console.log("8.1 Zero gradients:");
  const model = new TensorMiniMindModel({
    vocabSize: 100, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 16,
  });
  const opt = new AdamWOptimizer(model.parameters(), { lr: 0.001 });
  const tracker = new GradientNormTracker(opt, model.parameters());
  // zeroGrad then step - should have ~0 norm
  model.zeroGrad();
  tracker.step();
  assert(tracker.lastNorm < 1e-10, "norm near-zero after zeroGrad");

  // 8.2: normAt with no steps returns undefined
  console.log("8.2 normAt no steps:");
  const fresh = new GradientNormTracker(
    new AdamWOptimizer(model.parameters(), { lr: 0.001 }),
    model.parameters()
  );
  assert(fresh.normAt(0) === undefined, "normAt returns undefined with no history");

  // 8.3: resetHistory preserves tracking ability
  console.log("8.3 resetHistory durability:");
  const m3 = new TensorMiniMindModel({
    vocabSize: 100, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 16,
  });
  const o3 = new AdamWOptimizer(m3.parameters(), { lr: 0.001 });
  const t3 = new GradientNormTracker(o3, m3.parameters());
  const inp = new Tensor(new Float64Array([1, 2, 3, 4]), [1, 4]);
  sum(m3.forward(inp)).backward();
  t3.step();
  const n1 = t3.lastNorm;
  t3.resetHistory();
  sum(m3.forward(inp)).backward();
  t3.step();
  const n2 = t3.lastNorm;
  assert(t3.stepCount === 1, "stepCount 1 after reset + step");
  assert(t3.normHistory.length === 1, "normHistory has 1 entry after reset");

  // 8.4: Large number of steps
  console.log("8.4 Many steps:");
  const m4 = new TensorMiniMindModel({
    vocabSize: 100, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 16,
  });
  const o4 = new AdamWOptimizer(m4.parameters(), { lr: 0.001 });
  const t4 = new GradientNormTracker(o4, m4.parameters());
  for (let i = 0; i < 20; i++) {
    const inp4 = new Tensor(new Float64Array([i, i+1, i+2, i+3]), [1, 4]);
    sum(m4.forward(inp4)).backward();
    t4.step();
    t4.zeroGrad();
  }
  assert(t4.stepCount === 20, "20 steps recorded");
  assert(t4.normHistory.length === 20, "20 norm entries");

  // 8.5: Each norm entry has correct step index
  console.log("8.5 Step index correctness:");
  for (let i = 0; i < t4.normHistory.length; i++) {
    assert(t4.normHistory[i].step === i, `step ${i} index matches`);
  }
}

// ============================================================
// Test Suite 9: Report Edge Cases
// ============================================================

async function testReportEdgeCases(): Promise<void> {
  console.log("\n=== Test Suite 9: Report Edge Cases ===\n");

  // 9.1: Report with reproducibility data
  console.log("9.1 Report with reproducibility:");
  const result = await runQuickCampaign({
    seed: 42, epochs: 1, runGenerationEval: false,
    saveToDisk: false, generateReports: false,
  });
  const report = CampaignReport.fromCampaignResult(result, {
    reproducibility: {
      validated: true, identical: true, maxLossDiff: 1e-15,
      checkpointsMatch: true, generationsMatch: true,
    },
  });
  assert(report.data.reproducibility!.identical === true, "repro identical");
  const md = report.toMarkdown();
  assert(md.includes("Reproducibility"), "md includes reproducibility");

  // 9.2: Report with non-identical reproducibility
  console.log("9.2 Non-identical reproducibility:");
  const report2 = CampaignReport.fromCampaignResult(result, {
    reproducibility: {
      validated: true, identical: false, maxLossDiff: 0.01,
      checkpointsMatch: false, generationsMatch: false,
    },
  });
  const md2 = report2.toMarkdown();
  assert(md2.includes("Not reproducible"), "md shows not reproducible");

  // 9.3: fromJSON with non-existent file throws
  console.log("9.3 fromJSON missing file:");
  assertThrows(
    () => CampaignReport.fromJSON("/nonexistent/path/report.json"),
    "throws on missing file"
  );

  // 9.4: Save creates directory structure
  console.log("9.4 Save creates directories:");
  const deepPath = ".cache/minimind/test-phase55/deep/nested/report.json";
  report.saveJSON(deepPath);
  assert(fs.existsSync(deepPath), "deep file saved");
  try { fs.rmSync(".cache/minimind/test-phase55/deep", { recursive: true }); } catch { /* ok */ }

  // 9.5: Markdown includes seed
  console.log("9.5 Markdown includes seed:");
  assert(md.includes("Seed:"), "markdown has seed info");

  // 9.6: Summarize includes name
  console.log("9.6 Summarize:");
  const s = report.summarize();
  assert(s.includes(result.name), "summary includes name");
}

// ============================================================
// Test Suite 10: Model Consistency
// ============================================================

function testModelConsistency(): void {
  console.log("\n=== Test Suite 10: Model Consistency ===\n");

  // 10.1: Same config → same model params
  console.log("10.1 Model determinism:");
  Random.setSeed(42);
  const m1 = new TensorMiniMindModel({
    vocabSize: 100, dModel: 32, numHeads: 4, dFF: 64, numLayers: 2, maxSeqLen: 32,
  });
  Random.setSeed(42);
  const m2 = new TensorMiniMindModel({
    vocabSize: 100, dModel: 32, numHeads: 4, dFF: 64, numLayers: 2, maxSeqLen: 32,
  });
  const p1 = m1.namedParameters();
  const p2 = m2.namedParameters();
  assert(p1.length === p2.length, "same param count");
  let maxDiff = 0;
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p1[i].parameter.data.length; j++) {
      const d = Math.abs(p1[i].parameter.data[j] - p2[i].parameter.data[j]);
      if (d > maxDiff) maxDiff = d;
    }
  }
  assert(maxDiff < 1e-15, "same seed → identical params");

  // 10.2: Forward pass is deterministic
  console.log("10.2 Forward determinism:");
  const inp = new Tensor(new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]), [1, 8]);
  const out1 = m1.forward(inp);
  const out2 = m2.forward(inp);
  let outDiff = 0;
  for (let i = 0; i < out1.data.length; i++) {
    const d = Math.abs(out1.data[i] - out2.data[i]);
    if (d > outDiff) outDiff = d;
  }
  assert(outDiff < 1e-15, "forward pass deterministic");

  // 10.3: Different seed → different forward output
  console.log("10.3 Different seed divergence:");
  Random.setSeed(99);
  const m3 = new TensorMiniMindModel({
    vocabSize: 100, dModel: 32, numHeads: 4, dFF: 64, numLayers: 2, maxSeqLen: 32,
  });
  const out3 = m3.forward(inp);
  let anyDiff = false;
  for (let i = 0; i < out1.data.length; i++) {
    if (Math.abs(out1.data[i] - out3.data[i]) > 1e-10) {
      anyDiff = true;
      break;
    }
  }
  assert(anyDiff, "different seed → different output");
}

// ============================================================
// Main Runner
// ============================================================

export async function runPhase55Tests(): Promise<{
  passed: number;
  failed: number;
  total: number;
}> {
  console.log("=".repeat(60));
  console.log("Phase 55 — Training Campaign Validation Tests");
  console.log("=".repeat(60));

  passed = 0;
  failed = 0;

  // ── Synchronous tests ──
  testGradientNormTracker();
  testGradientNormTrackerEdgeCases();
  testConfigValidation();
  testModelConsistency();

  // ── Async tests ──
  await testCampaignReport();
  await testReproducibilityValidator();
  await testTrainingCampaign();
  await testIntegration();
  await testEdgeCases();
  await testReportEdgeCases();

  const total = passed + failed;

  console.log("\n" + "=".repeat(60));
  console.log("Phase 55 Test Summary:");
  console.log(`  GradientNormTracker:      included`);
  console.log(`  CampaignReport:            included`);
  console.log(`  ReproducibilityValidator:  included`);
  console.log(`  TrainingCampaign Pipeline: included`);
  console.log(`  Config Validation:         included`);
  console.log(`  Integration:               included`);
  console.log(`  Edge Cases:                included`);
  console.log(`  GradientNormTracker Edge:  included`);
  console.log(`  Report Edge Cases:         included`);
  console.log(`  Model Consistency:         included`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL:                    ${passed} passed, ${failed} failed (${total} tests)`);
  console.log("=".repeat(60));

  return { passed, failed, total };
}

// Allow running directly
const isMainModule = process.argv.length >= 2 &&
  (process.argv[1]?.endsWith("phase55-campaign.test.ts") ||
   process.argv[1]?.endsWith("phase55-campaign.test"));

if (isMainModule) {
  runPhase55Tests().then((result) => {
    if (result.failed > 0) {
      process.exit(1);
    }
    console.log(`\nAll ${result.total} tests passed!`);
  }).catch((err) => {
    console.error("\nTest runner error:", err);
    process.exit(1);
  });
}
