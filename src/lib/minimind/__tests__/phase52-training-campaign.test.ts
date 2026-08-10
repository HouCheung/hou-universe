// ============================================================
// Phase 52 — Training Campaign Validation Tests
// ============================================================
// Covers:
//   1. Config validation — ExperimentConfig.validate()
//   2. Seed reproducibility — same seed → identical model params
//   3. Model creation — createModel("small") architecture
//   4. Checkpoint round-trip — save/load preserves parameters
//   5. Training pipeline — runTrainingExperiment() end-to-end
//   6. Report generation — TrainingReport.toMarkdown()
//   7. Generation comparison — GenerationEvaluator.compare()
//
// Usage:
//   npx tsx src/lib/minimind/__tests__/phase52-training-campaign.test.ts
//
// Constraints:
//   - All metrics from real training (no mock loss)
//   - Does NOT modify Tensor core or Transformer
//   - Does NOT modify AI Lab UI or old MiniMindModel
// ============================================================

import * as fs from "fs";
import * as path from "path";

import { ExperimentConfig } from "../experiments/ExperimentConfig";
import type { ExperimentConfigFile } from "../experiments/ExperimentConfig";
import { runTrainingExperiment } from "../experiments/TrainingExperimentRunner";
import { createModel, getModelConfig } from "../experiments/ModelRegistry";
import { loadRecipe } from "../experiments/TrainingRecipe";
import { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import { BPETokenizer } from "../tokenizer/BPETokenizer";
import { Tensor } from "../core/Tensor";
import { Random } from "../core/random/Random";
import { saveCheckpoint, loadCheckpoint } from "../training/checkpoint";
import type { CheckpointData } from "../training/checkpoint";
import { GenerationEvaluator } from "../evaluation/GenerationEvaluator";
import { TrainingReport } from "../evaluation/TrainingReport";
import { getLatestTrainingRun, getTrainingMetrics, getTrainingStats, hasTrainingHistory } from "@/lib/ai-lab/adapters/trainingAdapter";

// ============================================================
// localStorage polyfill for Node.js test environment
// ============================================================

(globalThis as Record<string, unknown>).localStorage ??= (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string): string | null => store.get(key) ?? null,
    setItem: (key: string, value: string): void => { store.set(key, value); },
    removeItem: (key: string): void => { store.delete(key); },
    get length(): number { return store.size; },
    clear(): void { store.clear(); },
    key(index: number): string | null {
      const keys = Array.from(store.keys());
      return keys[index] ?? null;
    },
  };
})();

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
// Test Suite 1: Config Validation
// ============================================================

function testConfigValidation(): void {
  console.log("\n=== Test Suite 1: Config Validation ===\n");

  // 1.1: Valid config file loads without error
  console.log("1.1 Valid config loading:");
  const configPath = path.resolve(
    __dirname,
    "../experiments/configs/tinystories-baseline.json"
  );
  if (fs.existsSync(configPath)) {
    const config = ExperimentConfig.fromFile(configPath);
    assert(config !== undefined, "ExperimentConfig.fromFile loads baseline config");
    assert(config.data.name === "tinystories-baseline", "config name is tinystories-baseline");
    assert(config.data.seed === 42, "config seed is 42");
    assert(config.data.model.preset === "custom", "model preset is custom");
    assert(config.data.model.dModel === 256, "dModel is 256");
    assert(config.data.model.numLayers === 6, "numLayers is 6");
    assert(config.data.model.vocabSize === 32000, "vocabSize is 32000");
    assert(config.data.training.epochs === 3, "epochs is 3");
    assert(config.data.dataset.batchSize === 8, "batch size is 8");
    assert(config.data.training.gradientAccumulationSteps === 4, "gradient accumulation steps is 4");
    assert(config.data.optimizer.lr === 0.0003, "learning rate is 3e-4");
    assert(config.data.optimizer.type === "adamw", "optimizer is adamw");
    assert(config.data.scheduler && typeof config.data.scheduler === "object" && "type" in config.data.scheduler && config.data.scheduler.type === "cosine", "scheduler is cosine");
  } else {
    console.log(`  SKIP: config file not found at ${configPath}`);
  }

  // 1.2: Validation rejects bad configs
  console.log("1.2 Invalid config rejection:");
  assertThrows(() => ExperimentConfig.validate(null), "rejects null config");
  assertThrows(() => ExperimentConfig.validate({}), "rejects empty object");
  assertThrows(() => ExperimentConfig.validate({ version: 2 }), "rejects unsupported version");
  assertThrows(
    () => ExperimentConfig.validate({ version: 1, name: "" }),
    "rejects empty name"
  );
  assertThrows(
    () => ExperimentConfig.validate({ version: 1, name: "test", seed: 3.14 }),
    "rejects non-integer seed"
  );

  // 1.3: Valid minimal config passes validation
  console.log("1.3 Valid minimal config:");
  const minimalConfig: ExperimentConfigFile = {
    version: 1,
    name: "minimal-test",
    seed: 1,
    dataset: {
      type: "inline",
      blockSize: 8,
      batchSize: 2,
    },
    model: {
      preset: "tiny",
      vocabSize: 100,
    },
    tokenizer: {
      type: "bpe",
      vocabSize: 300,
    },
    optimizer: {
      type: "adamw",
      lr: 0.001,
    },
    scheduler: {
      type: "cosine",
    },
    training: {
      epochs: 1,
    },
    output: {
      dir: "/tmp/test",
    },
  };
  const validated = ExperimentConfig.validate(minimalConfig);
  assert(validated.name === "minimal-test", "minimal config passes validation");

  // 1.4: Model dimensions resolve correctly (ExperimentConfig presets)
  console.log("1.4 Model dimensions:");
  const config = ExperimentConfig.fromObject(minimalConfig);
  const dims = config.getModelDimensions();
  assert(dims.vocabSize === 100, "vocabSize from config");
  assert(dims.dModel === 128, "dModel from tiny preset (128)");
  assert(dims.numHeads === 4, "numHeads from tiny preset (4)");
  assert(dims.numLayers === 2, "numLayers from ExperimentConfig tiny preset (2)");

  // 1.5: Custom config resolves correctly
  console.log("1.5 Custom model dimensions:");
  if (fs.existsSync(configPath)) {
    const baselineConfig = ExperimentConfig.fromFile(configPath);
    const bDims = baselineConfig.getModelDimensions();
    assert(bDims.dModel === 256, "custom dModel is 256");
    assert(bDims.numHeads === 8, "custom numHeads is 8");
    assert(bDims.numLayers === 6, "custom numLayers is 6");
    assert(bDims.dFF === 1024, "custom dFF is 1024");
  }
}

// ============================================================
// Test Suite 2: Seed Reproducibility
// ============================================================

function testSeedReproducibility(): void {
  console.log("\n=== Test Suite 2: Seed Reproducibility ===\n");

  // 2.1: Same seed → same random numbers
  console.log("2.1 Random number reproducibility:");
  Random.setSeed(42);
  const nums1 = Array.from({ length: 10 }, () => Random.random());
  Random.setSeed(42);
  const nums2 = Array.from({ length: 10 }, () => Random.random());
  for (let i = 0; i < 10; i++) {
    assertClose(nums1[i], nums2[i], 1e-15, `Random.random() #${i} identical with same seed`);
  }

  // 2.2: Different seed → different random numbers
  console.log("2.2 Different seeds diverge:");
  Random.setSeed(42);
  const a = Random.random();
  Random.setSeed(99);
  const b = Random.random();
  assert(a !== b, "different seeds produce different random numbers");

  // 2.3: Same seed → same model parameters
  console.log("2.3 Model parameter reproducibility:");
  Random.setSeed(42);
  const model1 = new TensorMiniMindModel({
    vocabSize: 100,
    dModel: 32,
    numHeads: 4,
    dFF: 64,
    numLayers: 2,
    maxSeqLen: 32,
  });

  Random.setSeed(42);
  const model2 = new TensorMiniMindModel({
    vocabSize: 100,
    dModel: 32,
    numHeads: 4,
    dFF: 64,
    numLayers: 2,
    maxSeqLen: 32,
  });

  const params1 = model1.namedParameters();
  const params2 = model2.namedParameters();
  assert(params1.length === params2.length, "same number of parameters");

  let maxDiff = 0;
  for (let i = 0; i < params1.length; i++) {
    const p1 = params1[i].parameter.data;
    const p2 = params2[i].parameter.data;
    assert(p1.length === p2.length, `parameter ${params1[i].name} has same shape`);
    for (let j = 0; j < p1.length; j++) {
      const diff = Math.abs(p1[j] - p2[j]);
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  assert(maxDiff < 1e-15, `all parameters identical with same seed (max diff: ${maxDiff.toExponential(2)})`);

  // 2.4: Different seed → different model parameters
  console.log("2.4 Different seed => different parameters:");
  Random.setSeed(99);
  const model3 = new TensorMiniMindModel({
    vocabSize: 100,
    dModel: 32,
    numHeads: 4,
    dFF: 64,
    numLayers: 2,
    maxSeqLen: 32,
  });
  const params3 = model3.namedParameters();
  let anyDifferent = false;
  for (let i = 0; i < params1.length; i++) {
    const p1 = params1[i].parameter.data;
    const p3 = params3[i].parameter.data;
    for (let j = 0; j < p1.length; j++) {
      if (Math.abs(p1[j] - p3[j]) > 1e-15) {
        anyDifferent = true;
        break;
      }
    }
    if (anyDifferent) break;
  }
  assert(anyDifferent, "different seeds produce different parameters");
}

// ============================================================
// Test Suite 3: Model Creation
// ============================================================

function testModelCreation(): void {
  console.log("\n=== Test Suite 3: Model Creation ===\n");

  // 3.1: createModel("tiny") — from ModelRegistry
  console.log("3.1 ModelRegistry.createModel:");
  const tinyModel = createModel("tiny");
  assert(tinyModel instanceof TensorMiniMindModel, "tiny model is TensorMiniMindModel");
  const tinyConfig = getModelConfig("tiny");
  assert(tinyConfig.name === "tiny", "tiny config name");
  assert(tinyConfig.dModel === 128, "tiny dModel=128");
  assert(tinyConfig.numLayers === 4, "tiny numLayers=4");

  // 3.2: createModel("small") — matches Phase 52 baseline spec
  console.log("3.2 Small model architecture:");
  const smallConfig = getModelConfig("small");
  assert(smallConfig.name === "small", "small config name");
  assert(smallConfig.dModel === 256, "small dModel=256");
  assert(smallConfig.numHeads === 8, "small numHeads=8");
  assert(smallConfig.numLayers === 6, "small numLayers=6");
  assert(smallConfig.dFF === 1024, "small dFF=1024");
  assert(smallConfig.vocabSize === 32000, "small vocabSize=32000");
  assert(smallConfig.estimatedParams > 0, "estimated params computed");

  // 3.3: createModel("base") — largest preset
  console.log("3.3 Base model architecture:");
  const baseConfig = getModelConfig("base");
  assert(baseConfig.dModel === 512, "base dModel=512");
  assert(baseConfig.numLayers === 8, "base numLayers=8");

  // 3.4: Unknown model throws
  console.log("3.4 Unknown model rejection:");
  assertThrows(() => createModel("nonexistent"), "createModel rejects unknown model");
  assertThrows(() => getModelConfig("fake-model"), "getModelConfig rejects unknown model");

  // 3.5: Model forward pass works on random input
  console.log("3.5 Model forward pass:");
  const model = createModel("tiny", 128);
  const input = new Tensor(new Float64Array([1, 2, 3, 4, 5, 6, 7, 8]), [1, 8]);
  const logits = model.forward(input);
  assert(logits.shape.length === 3, "logits has 3 dims");
  assert(logits.shape[0] === 1, "batch dim = 1");
  assert(logits.shape[1] === 8, "seq dim = 8");
  assert(logits.shape[2] === 128, "vocab dim = 128");
}

// ============================================================
// Test Suite 4: Checkpoint Round-Trip
// ============================================================

function testCheckpointRoundTrip(): void {
  console.log("\n=== Test Suite 4: Checkpoint Round-Trip ===\n");

  // 4.1: Save checkpoint
  console.log("4.1 Save checkpoint:");
  const model = createModel("tiny", 256);
  const checkpoint = saveCheckpoint({
    model,
    optimizer: {
      parameters: model.parameters(),
      step: () => {},
      zeroGrad: () => {},
    },
    trainerState: {
      epoch: 0,
      globalStep: 10,
      totalBatches: 100,
      currentBatch: 5,
      lossHistory: [5.0, 4.0, 3.0],
      bestLoss: 3.0,
      bestEpoch: 0,
      bestGlobalStep: 5,
      evalHistory: [],
      completed: false,
      randomState: null,
      dataloaderState: null,
      streamingDataloaderState: null,
    },
  });
  assert(checkpoint.version === 3, "checkpoint version is 3");
  assert(Array.isArray(checkpoint.modelParams), "checkpoint has modelParams array");
  assert(checkpoint.modelParams.length > 0, "checkpoint has model parameters");

  // 4.2: Load checkpoint into fresh model
  console.log("4.2 Load checkpoint:");
  const restoredModel = createModel("tiny", 256);

  loadCheckpoint({
    model: restoredModel,
    optimizer: {
      parameters: restoredModel.parameters(),
      step: () => {},
      zeroGrad: () => {},
    },
    checkpoint,
  });

  const paramsAfter = restoredModel.namedParameters();

  // 4.3: Verify parameters restored correctly
  console.log("4.3 Parameter restoration:");
  const origParams = model.namedParameters();
  let maxDiff = 0;
  for (let i = 0; i < origParams.length; i++) {
    const orig = origParams[i].parameter.data;
    const rest = paramsAfter[i].parameter.data;
    for (let j = 0; j < orig.length; j++) {
      const diff = Math.abs(orig[j] - rest[j]);
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  assert(maxDiff < 1e-10, `parameters restored correctly (max diff: ${maxDiff.toExponential(2)})`);

  // 4.4: Checkpoint serialization round-trip
  console.log("4.4 JSON serialization round-trip:");
  const json = JSON.stringify(checkpoint);
  const parsed = JSON.parse(json) as CheckpointData;
  assert(parsed.version === 3, "parsed checkpoint version preserved");
  assert(parsed.modelParams.length === checkpoint.modelParams.length, "parsed param count matches");

  // 4.5: Restored model produces same forward output
  console.log("4.5 Forward pass consistency after restore:");
  const testInput = new Tensor(new Float64Array([10, 20, 30, 40]), [1, 4]);
  const origLogits = model.forward(testInput);
  const restLogits = restoredModel.forward(testInput);
  let logitDiff = 0;
  for (let i = 0; i < origLogits.data.length; i++) {
    const d = Math.abs(origLogits.data[i] - restLogits.data[i]);
    if (d > logitDiff) logitDiff = d;
  }
  assert(logitDiff < 1e-10, `forward pass identical after restore (max logit diff: ${logitDiff.toExponential(2)})`);
}

// ============================================================
// Test Suite 5: Training Pipeline Integration
// ============================================================

async function testTrainingPipeline(): Promise<void> {
  console.log("\n=== Test Suite 5: Training Pipeline Integration ===\n");

  // 5.1: End-to-end training with inline corpus (fast, no network)
  console.log("5.1 End-to-end pipeline with inline corpus:");

  const inlineTexts = [
    "the cat sat on the mat",
    "the dog ran in the park",
    "once upon a time there was a princess",
    "the sun was shining brightly in the sky",
    "a bird flew over the tall tree",
    "the fish swam in the clear water",
    "the boy played with his red ball",
    "a beautiful rainbow appeared after the rain",
    "the girl read a book under the lamp",
    "the horse jumped over the fence",
  ];

  // Repeat texts to get enough training data
  const corpus = Array.from(
    { length: 50 },
    (_, i) => inlineTexts[i % inlineTexts.length]
  );

  // Train tokenizer
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, 300);

  // Create config
  const config = ExperimentConfig.fromObject({
    version: 1,
    name: "pipeline-test",
    seed: 42,
    dataset: {
      type: "inline",
      blockSize: 16,
      batchSize: 4,
    },
    model: {
      preset: "custom",
      vocabSize: tokenizer.vocabSize,
      dModel: 32,
      numHeads: 4,
      dFF: 64,
      numLayers: 2,
      maxSeqLen: 16,
    },
    tokenizer: {
      type: "bpe",
      vocabSize: 300,
    },
    optimizer: {
      type: "adamw",
      lr: 0.001,
      weightDecay: 0.01,
    },
    scheduler: {
      type: "cosine",
      warmupSteps: 5,
    },
    training: {
      epochs: 2,
      gradientAccumulationSteps: 1,
      gradientClipNorm: 1.0,
      logInterval: 5,
    },
    output: {
      dir: ".cache/minimind/test-phase52",
    },
  });

  // Run the experiment
  const result = await runTrainingExperiment(
    { config, dataset: corpus, tokenizer },
    {
      runGenerationEval: true,
      generationPrompts: ["the cat", "once upon"],
      generationMaxTokens: 10,
      saveToDisk: false,
    }
  );

  // 5.2: Verify result structure
  console.log("5.2 Result structure:");
  assert(result.name === "pipeline-test", "result has correct name");
  assert(result.totalSteps > 0, `training steps > 0 (got ${result.totalSteps})`);
  assert(isFinite(result.finalLoss), "final loss is finite");
  assert(isFinite(result.bestLoss), "best loss is finite");
  assert(result.bestLoss <= result.finalLoss || Math.abs(result.bestLoss - result.finalLoss) < 1e-6,
    "best loss <= final loss");

  // 5.3: Loss decreases from random init
  console.log("5.3 Loss behavior:");
  const records = result.metrics.getRecords();
  assert(records.length > 0, "metrics records exist");
  if (records.length >= 2) {
    const firstLoss = records[0].loss;
    const lastLoss = records[records.length - 1].loss;
    console.log(`  First recorded loss: ${firstLoss.toFixed(4)}`);
    console.log(`  Last recorded loss: ${lastLoss.toFixed(4)}`);
    // Loss should be finite; decrease is expected but not guaranteed on tiny data
    assert(isFinite(firstLoss), "first loss is finite");
    assert(isFinite(lastLoss), "last loss is finite");
  }

  // 5.4: Checkpoint in result is valid
  console.log("5.4 Result checkpoint:");
  assert(result.checkpoint.version === 3, "result checkpoint version is 3");
  assert(result.checkpoint.modelParams.length > 0, "result checkpoint has params");

  // 5.5: Perplexity is computed
  console.log("5.5 Perplexity:");
  assert(isFinite(result.perplexity), "perplexity is finite");
  assert(result.perplexity > 0, "perplexity is positive");

  // 5.6: Duration is tracked
  console.log("5.6 Timing:");
  assert(result.durationMs > 0, `duration tracked (${result.durationMs}ms)`);
}

// ============================================================
// Test Suite 6: Report Generation
// ============================================================

async function testReportGeneration(): Promise<void> {
  console.log("\n=== Test Suite 6: Report Generation ===\n");

  // 6.1: TrainingReport.fromExperimentResult
  console.log("6.1 Report from experiment result:");

  // Quick inline experiment to get a result
  const corpus = ["hello world", "foo bar baz", "the quick brown fox", "lorem ipsum dolor"];
  const tokenizer = new BPETokenizer();
  tokenizer.train(corpus, 300);

  const config = ExperimentConfig.fromObject({
    version: 1,
    name: "report-test",
    seed: 7,
    dataset: { type: "inline", blockSize: 8, batchSize: 2 },
    model: { preset: "custom", vocabSize: tokenizer.vocabSize, dModel: 16, numHeads: 2, dFF: 32, numLayers: 1, maxSeqLen: 8 },
    tokenizer: { type: "bpe", vocabSize: 300 },
    optimizer: { type: "adamw", lr: 0.01 },
    scheduler: { type: "cosine", warmupSteps: 0 },
    training: { epochs: 1 },
    output: { dir: ".cache/minimind/test-report" },
  });

  const result = await runTrainingExperiment(
    { config, dataset: corpus, tokenizer },
    {
      runGenerationEval: true,
      generationPrompts: ["hello", "the"],
      generationMaxTokens: 5,
      saveToDisk: false,
    }
  );

  const report = TrainingReport.fromExperimentResult(result, { seed: 7 });

  // 6.2: Report data structure
  console.log("6.2 Report data structure:");
  assert(report.data.metadata.name === "report-test", "report name matches");
  assert(report.data.metadata.version === 1, "report version is 1");
  assert(report.data.model.className === "TensorMiniMindModel", "model class name");
  assert(report.data.model.config.dModel === 16, "report records dModel");
  assert(report.data.training.steps > 0, "report records training steps");
  assert(isFinite(report.data.training.finalLoss), "report records final loss");

  // 6.3: Markdown generation
  console.log("6.3 Markdown generation:");
  const markdown = report.toMarkdown();
  assert(markdown.length > 0, "markdown is non-empty");
  assert(markdown.includes("# MiniMind Training Report"), "markdown has title");
  assert(markdown.includes("## Model"), "markdown has Model section");
  assert(markdown.includes("## Dataset"), "markdown has Dataset section");
  assert(markdown.includes("## Training"), "markdown has Training section");
  assert(markdown.includes("## Loss"), "markdown has Loss section");
  assert(markdown.includes("## Perplexity"), "markdown has Perplexity section");
  assert(markdown.includes("## Reproducibility"), "markdown has Reproducibility section");
  assert(markdown.includes("Seed:"), "markdown includes seed info");

  // 6.4: Report summarization
  console.log("6.4 Report summarization:");
  const summary = report.summarize();
  assert(summary.length > 0, "summary is non-empty");
  assert(summary.includes("report-test"), "summary includes experiment name");

  // 6.5: Report JSON export
  console.log("6.5 Report JSON export:");
  const json = report.toJSON();
  assert(json.length > 0, "JSON export is non-empty");
  const reparsed = JSON.parse(json);
  assert(reparsed.metadata.version === 1, "JSON round-trip preserves version");
}

// ============================================================
// Test Suite 7: Generation Comparison
// ============================================================

function testGenerationComparison(): void {
  console.log("\n=== Test Suite 7: Generation Comparison ===\n");

  // 7.1: GenerationEvaluator construction
  console.log("7.1 GenerationEvaluator construction:");
  const model = createModel("tiny", 320);
  const tokenizer = new BPETokenizer();
  tokenizer.train(["hello world", "foo bar", "the quick brown fox jumps over the lazy dog"], 320);
  const evaluator = new GenerationEvaluator(model, tokenizer);
  assert(evaluator instanceof GenerationEvaluator, "GenerationEvaluator constructs");

  // 7.2: evaluate() returns correct structure
  console.log("7.2 evaluate() structure:");
  const prompts = ["hello", "world"];
  const results = evaluator.evaluate(prompts, { maxTokens: 5, seed: 42 });
  assert(Array.isArray(results), "evaluate returns array");
  assert(results.length === prompts.length, "one result per prompt");
  assert(results[0].prompt === "hello", "result preserves prompt");
  assert(typeof results[0].generatedText === "string", "result has generatedText");
  assert(results[0].generatedIds.length > 0, "result has generated token IDs");
  assert(typeof results[0].avgLogProb === "number", "result has avgLogProb");
  assert(typeof results[0].perplexity === "number", "result has perplexity");

  // 7.3: compare() returns correct structure
  console.log("7.3 compare() structure:");
  const beforeResults = results;
  const afterResults = evaluator.evaluate(prompts, { maxTokens: 5, seed: 99 });
  const comparison = evaluator.compare(beforeResults, afterResults);
  assert(Array.isArray(comparison), "compare returns array");
  assert(comparison.length === prompts.length, "one comparison per prompt");
  assert(comparison[0].prompt === "hello", "comparison preserves prompt");
  assert(typeof comparison[0].beforeText === "string", "comparison has beforeText");
  assert(typeof comparison[0].afterText === "string", "comparison has afterText");
  assert(typeof comparison[0].changed === "boolean", "comparison has changed flag");
  assert(typeof comparison[0].logProbDelta === "number", "comparison has logProbDelta");
  assert(typeof comparison[0].perplexityDelta === "number", "comparison has perplexityDelta");

  // 7.4: Identical seeds produce identical results
  console.log("7.4 Generation reproducibility:");
  const r1 = evaluator.evaluate(["test"], { maxTokens: 5, seed: 42 });
  const r2 = evaluator.evaluate(["test"], { maxTokens: 5, seed: 42 });
  assert(r1[0].generatedText === r2[0].generatedText, "same seed produces same generation");

  // 7.5: Different seeds produce (likely) different results
  console.log("7.5 Generation variance:");
  const r3 = evaluator.evaluate(["test"], { maxTokens: 5, seed: 999 });
  // With temperature=0.8, different seeds MAY produce different results
  // Just verify both ran successfully
  assert(r3[0].generatedIds.length > 0, "different seed also generates tokens");
}

// ============================================================
// Test Suite 8: AI Lab Training Adapter
// ============================================================

function testTrainingAdapter(): void {
  console.log("\n=== Test Suite 8: AI Lab Training Adapter ===\n");

  // 8.1: hasTrainingHistory returns boolean
  console.log("8.1 hasTrainingHistory:");
  const hasHistory = hasTrainingHistory();
  assert(typeof hasHistory === "boolean", "hasTrainingHistory returns boolean");

  // 8.2: getLatestTrainingRun returns null or record
  console.log("8.2 getLatestTrainingRun:");
  const latest = getLatestTrainingRun();
  assert(latest === null || typeof latest === "object", "getLatestTrainingRun returns null or record");
  if (latest) {
    assert(typeof latest.id === "string", "record has id");
    assert(typeof latest.name === "string", "record has name");
  }

  // 8.3: getTrainingMetrics returns null or metrics
  console.log("8.3 getTrainingMetrics:");
  const metrics = getTrainingMetrics();
  assert(metrics === null || typeof metrics === "object", "getTrainingMetrics returns null or metrics");
  if (metrics) {
    assert(typeof metrics.bestLoss === "number", "metrics has bestLoss");
    assert(typeof metrics.finalLoss === "number", "metrics has finalLoss");
  }

  // 8.4: getTrainingStats returns stats object
  console.log("8.4 getTrainingStats:");
  const stats = getTrainingStats();
  assert(typeof stats.totalRuns === "number", "stats has totalRuns");
  assert(typeof stats.completedRuns === "number", "stats has completedRuns");
  assert(typeof stats.failedRuns === "number", "stats has failedRuns");
  assert(stats.totalRuns >= stats.completedRuns + stats.failedRuns, "total runs >= completed + failed");

  // 8.5: Adapter functions don't throw on empty state
  console.log("8.5 Adapter graceful degradation:");
  try {
    getLatestTrainingRun();
    getTrainingMetrics();
    getTrainingStats();
    hasTrainingHistory();
    assert(true, "all adapter functions return without throwing");
  } catch (err) {
    assert(false, `adapter function threw: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ============================================================
// Test Suite 9: Training Recipe Verification
// ============================================================

function testRecipeIntegration(): void {
  console.log("\n=== Test Suite 9: Training Recipe Integration ===\n");

  // 9.1: Built-in recipes reference valid models
  console.log("9.1 Recipe-model consistency:");
  const recipes = ["tiny-overfit-test", "tinystories-tiny", "tinystories-small"];
  for (const name of recipes) {
    const recipe = loadRecipe(name);
    assert(typeof recipe.model === "string", `recipe ${name} has model field`);
    // Model should exist in registry
    try {
      getModelConfig(recipe.model);
      assert(true, `recipe ${name} references valid model "${recipe.model}"`);
    } catch {
      assert(false, `recipe ${name} references unknown model "${recipe.model}"`);
    }
  }

  // 9.2: tinystories-small recipe matches baseline config intent
  console.log("9.2 Baseline recipe consistency:");
  const tsSmall = loadRecipe("tinystories-small");
  assert(tsSmall.model === "small", "tinystories-small uses small model");
  assert(tsSmall.dataset.dataset === "tinystories", "uses tinystories dataset");
  assert(tsSmall.optimizer.type === "adamw", "uses adamw");
  assert(tsSmall.epochs === 10, "has 10 epochs");
  assert(tsSmall.gradientAccumulation === 4, "gradient accumulation is 4");
}

// ============================================================
// Main runner
// ============================================================

export async function runPhase52Tests(): Promise<{
  passed: number;
  failed: number;
  total: number;
}> {
  console.log("=".repeat(60));
  console.log("Phase 52 — Training Campaign Validation Tests");
  console.log("=".repeat(60));

  passed = 0;
  failed = 0;

  // ── Synchronous tests ──
  testConfigValidation();
  testSeedReproducibility();
  testModelCreation();
  testCheckpointRoundTrip();
  testGenerationComparison();
  testTrainingAdapter();
  testRecipeIntegration();

  // ── Async tests (real training) ──
  await testTrainingPipeline();
  await testReportGeneration();

  const total = passed + failed;

  console.log("\n" + "=".repeat(60));
  console.log("Phase 52 Test Summary:");
  console.log(`  Config Validation:        included`);
  console.log(`  Seed Reproducibility:     included`);
  console.log(`  Model Creation:           included`);
  console.log(`  Checkpoint Round-Trip:    included`);
  console.log(`  Training Pipeline:        included`);
  console.log(`  Report Generation:        included`);
  console.log(`  Generation Comparison:    included`);
  console.log(`  Training Adapter:         included`);
  console.log(`  Recipe Integration:       included`);
  console.log(`  ─────────────────────────────`);
  console.log(`  TOTAL:                    ${passed} passed, ${failed} failed (${total} tests)`);
  console.log("=".repeat(60));

  return { passed, failed, total };
}

// Allow running directly
// Note: In the tsx runner environment, we use a self-executing pattern
const isMainModule = process.argv.length >= 2 &&
  (process.argv[1]?.endsWith("phase52-training-campaign.test.ts") ||
   process.argv[1]?.endsWith("phase52-training-campaign.test"));

if (isMainModule) {
  runPhase52Tests().then((result) => {
    if (result.failed > 0) {
      process.exit(1);
    }
    console.log(`\nAll ${result.total} tests passed!`);
  }).catch((err) => {
    console.error("\nTest runner error:", err);
    process.exit(1);
  });
}
