# MiniMind Experiment Guide

## Overview

This guide explains how to configure, run, and compare MiniMind training experiments using the research validation layer. It covers the full workflow from model configuration to benchmark comparison.

## Workflow

The standard research workflow has 4 steps:

```
1. Configure Model  →  ModelRegistry
2. Load Dataset     →  TrainingRecipe
3. Run Experiment   →  BenchmarkRunner
4. Compare Results  →  Ablation
```

## Step 1: Configure Model

```typescript
import { createModel, getModelConfig, listModels } from "@/lib/minimind/experiments/ModelRegistry";

// Option A: Use a preset
const model = createModel("tiny");

// Option B: Inspect before creating
const config = getModelConfig("small");
console.log(`${config.label}: dModel=${config.dModel}, layers=${config.numLayers}`);
const model2 = createModel("small");

// Option C: See everything available
listModels().forEach(m => {
  console.log(`- ${m.name}: ${m.estimatedParams.toLocaleString()} params`);
});
```

## Step 2: Load a Training Recipe

```typescript
import { loadRecipe, listRecipes, summarizeRecipe } from "@/lib/minimind/experiments/TrainingRecipe";

// Load a built-in recipe
const recipe = loadRecipe("tinystories-tiny");
console.log(summarizeRecipe(recipe));
// Output:
// Recipe: TinyStories — Tiny Model (tinystories-tiny)
// Model:       tiny
// Dataset:     tinystories
// Optimizer:   adamw, lr=0.001
// Scheduler:   cosine
// Epochs:      10
// ...

// List all available recipes
console.log(listRecipes().map(r => r.name));
// ["tiny-overfit-test", "tinystories-tiny", "tinystories-small"]

// Create a custom recipe
saveRecipe({
  name: "my-experiment",
  label: "My Custom Experiment",
  description: "Testing a custom configuration",
  version: 1,
  model: "tiny",
  dataset: { dataset: "inline", blockSize: 64, batchSize: 4 },
  optimizer: { type: "adamw", lr: 0.0005 },
  scheduler: { type: "cosine" },
  epochs: 5,
  gradientAccumulation: 2,
  warmupSteps: 50,
  seed: 123,
});
```

## Step 3: Run Experiments

### Training Benchmark

```typescript
import { BenchmarkRunner } from "@/lib/minimind/evaluation/BenchmarkRunner";
import { AdamWOptimizer } from "@/lib/minimind/core/optim/AdamW";

const runner = new BenchmarkRunner(42);
const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.001 });

const trainingResult = runner.runTrainingBenchmark(model, optimizer, {
  steps: 100,
  batchSize: 4,
  seqLen: 64,
  vocabSize: model.vocabSize,
  warmupSteps: 5,
});

console.log(`Final loss: ${trainingResult.finalLoss.toFixed(4)}`);
console.log(`Throughput: ${trainingResult.tokensPerSecond.toFixed(0)} tok/s`);
```

### Generation Benchmark

```typescript
const genResult = runner.runGenerationBenchmark(model, {
  promptCount: 20,
  maxTokens: 50,
  temperature: 0.8,
});

console.log(`Generated ${genResult.totalTokensGenerated} tokens`);
console.log(`Speed: ${genResult.tokensPerSecond.toFixed(0)} tok/s`);
```

### Full Combined Benchmark

```typescript
const result = runner.runFullBenchmark(
  "tiny-baseline",
  model,
  optimizer,
  { steps: 50, batchSize: 4, seqLen: 64, vocabSize: model.vocabSize },
  { promptCount: 10, maxTokens: 30 }
);

console.log(runner.summarize(result));
```

## Step 4: Compare Results

### Two-way Comparison

```typescript
const baselineResult = runner.runFullBenchmark("baseline", modelA, opt, ...);
const experimentResult = runner.runFullBenchmark("experiment", modelB, opt, ...);

console.log(runner.compare(baselineResult, experimentResult));
```

### Multi-model Comparison

```typescript
const results = [
  runner.runFullBenchmark("tiny", createModel("tiny"), opt, trainCfg, genCfg),
  runner.runFullBenchmark("small", createModel("small"), opt, trainCfg, genCfg),
  runner.runFullBenchmark("base", createModel("base"), opt, trainCfg, genCfg),
];

console.log(runner.compareMultiple(results));
```

### Ablation Study

```typescript
import { Ablation } from "@/lib/minimind/experiments/Ablation";

const ablation = Ablation.fromModelConfig("heads-study", getModelConfig("tiny"));

ablation.addVariant("heads=2", { numHeads: 2 });
ablation.addVariant("heads=4", { numHeads: 4 });
ablation.addVariant("heads=8", { numHeads: 8 });

// Run each variant (pseudocode — you need to actually train each)
const baselineResult = trainAndBenchmark(ablation.baseline);
const variantResults = ablation.variants.map(v => {
  const config = ablation.resolveConfig(v);
  return trainAndBenchmark(config);
});

const table = ablation.buildComparisonTable(baselineResult, variantResults);
```

## Golden Validation Experiments

Three canonical experiments are provided to verify framework correctness:

### 1. Tiny Overfit Test

**File:** `experiments/golden/tiny-overfit.json`

**Purpose:** Verify the training pipeline is functional.

**Setup:** Tiny model (dModel=64, layers=2) on small synthetic data.

**Success Criteria:** Loss decreases >90% from initial value.

```typescript
// Pseudocode for running the golden test:
const config = ExperimentConfig.fromFile("experiments/golden/tiny-overfit.json");
// Train the model
const history = runTrainingLoop(model, criterion, optimizer, inputIds, targets, { epochs: 20 });
const reduction = (history.initialLoss - history.finalLoss) / history.initialLoss;
console.assert(reduction > 0.9, `Loss reduction only ${(reduction * 100).toFixed(1)}%`);
```

### 2. Attention Scaling

**File:** `experiments/golden/attention-scaling.json`

**Purpose:** Verify multi-head attention works at different head counts.

**Setup:** Same model trained with numHeads = 2, 4, and 8.

**Success Criteria:** All configurations train successfully without NaN.

### 3. Checkpoint Resume

**File:** `experiments/golden/checkpoint-resume.json`

**Purpose:** Verify checkpoint save/load preserves exact state.

**Setup:** Train for N steps → save → resume → compare logits.

**Success Criteria:** Logits match within 1e-6 tolerance.

## Reproducing Results

To reproduce any experiment:

1. **Pin the seed** — All experiments use a fixed `seed` field
2. **Use the same recipe** — Load from JSON, don't modify on the fly
3. **Save checkpoints** — Store model state for later comparison
4. **Record benchmark results** — Use `BenchmarkResult.timestamp` to track runs

## Model Statistics

```typescript
import { ModelStats } from "@/lib/minimind/evaluation/ModelStats";

const model = createModel("tiny");
const stats = ModelStats.summarize(model);

// Exact parameter count
console.log(`Parameters: ${stats.totalParameters.toLocaleString()}`);

// Per-layer breakdown
for (const layer of stats.layerBreakdown) {
  console.log(`  ${layer.name}: ${layer.totalElements.toLocaleString()} (${layer.percentage}%)`);
}

// Memory estimates
console.log(`FP32 memory: ${stats.memory.formatted.float32}`);

// Pretty-printed summary
console.log(stats.formattedSummary);
```

## Troubleshooting

### NaN Loss

If loss becomes NaN:
1. Reduce learning rate (try 10× smaller)
2. Enable gradient clipping (`gradientClipNorm: 1.0`)
3. Check that `dModel % numHeads === 0`
4. Verify vocabulary size matches tokenizer

### No Loss Reduction

If loss doesn't decrease:
1. Check that optimizer is updating parameters (gradients non-zero)
2. Increase learning rate
3. Reduce batch size
4. Verify data isn't all padding tokens

### Slow Training

1. Reduce `dModel` or `numLayers` for faster iteration
2. Use smaller `batchSize`
3. Reduce `maxSeqLen`
4. Profile with `BenchmarkRunner` to find bottlenecks
