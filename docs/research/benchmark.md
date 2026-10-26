# MiniMind Benchmark Guide

## Overview

The MiniMind benchmark system provides reproducible, comparable metrics for both training performance and generation quality. It enables researchers to:

1. Measure training throughput (tokens/sec, steps/sec)
2. Track loss convergence (initial loss, final loss, best loss)
3. Evaluate generation quality (perplexity, tokens/sec, EOS rate)
4. Compare different model architectures and training recipes

## Quick Start

```typescript
import { TensorMiniMindModel } from "@/lib/minimind";
import { BenchmarkRunner } from "@/lib/minimind/evaluation/BenchmarkRunner";
import { AdamWOptimizer } from "@/lib/minimind/core/optim/AdamW";

// Create model
const model = TensorMiniMindModel.tiny();

// Create optimizer
const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.001 });

// Create benchmark runner
const runner = new BenchmarkRunner(42);

// Run full benchmark
const result = runner.runFullBenchmark(
  "tiny-baseline",
  model,
  optimizer,
  { steps: 100, batchSize: 4, seqLen: 64, vocabSize: 6400 },
  { promptCount: 10, maxTokens: 30 }
);

// Print summary
console.log(runner.summarize(result));
```

## Training Benchmark

### Configuration

```typescript
interface TrainingBenchmarkConfig {
  steps: number;                    // Number of optimizer steps
  batchSize: number;                // Batch size
  seqLen: number;                   // Sequence length
  vocabSize: number;                // Vocabulary size (for synthetic data)
  warmupSteps?: number;             // Steps to exclude from metrics (default: 0)
  seed?: number;                    // Random seed (default: 42)
  gradientAccumulationSteps?: number; // Gradient accumulation (default: 1)
}
```

### Metrics Produced

| Metric | Description |
|--------|-------------|
| `tokensProcessed` | Total tokens = steps × batchSize × seqLen |
| `tokensPerSecond` | Throughput: tokens processed / second |
| `stepsPerSecond` | Steps per second (includes forward + backward) |
| `initialLoss` | Loss at first recorded step (after warmup) |
| `finalLoss` | Loss at last step |
| `bestLoss` | Minimum loss achieved |
| `avgStepTimeMs` | Average time per step in milliseconds |
| `lossHistory` | Per-step loss values (array) |

### Example: Training-only Benchmark

```typescript
const trainingResult = runner.runTrainingBenchmark(
  model,
  optimizer,
  { steps: 50, batchSize: 8, seqLen: 128, vocabSize: 32000 }
);

console.log(`Throughput: ${trainingResult.tokensPerSecond.toFixed(0)} tok/s`);
console.log(`Loss: ${trainingResult.initialLoss.toFixed(4)} → ${trainingResult.finalLoss.toFixed(4)}`);
```

## Generation Benchmark

### Configuration

```typescript
interface GenerationBenchmarkConfig {
  promptCount: number;          // Number of prompts to generate from
  maxTokens: number;            // Max tokens per prompt
  temperature?: number;         // Sampling temperature (0 = greedy)
  computePerplexity?: boolean;  // Compute perplexity (adds overhead)
  seed?: number;                // Random seed
}
```

### Metrics Produced

| Metric | Description |
|--------|-------------|
| `promptCount` | Number of prompts evaluated |
| `totalTokensGenerated` | Total tokens across all prompts |
| `avgTokensPerPrompt` | Average tokens per prompt |
| `tokensPerSecond` | Generation throughput |
| `avgPerplexity` | Average perplexity (if computed) |
| `eosCount` | How many generations hit EOS |
| `maxTokensCount` | How many hit the maxTokens limit |

## Comparing Benchmarks

### Two-way Comparison

```typescript
const before = runner.runFullBenchmark(...);
// ... change model/training ...
const after = runner.runFullBenchmark(...);

console.log(runner.compare(before, after));
```

### Multi-way Comparison

```typescript
const results = [
  runner.runFullBenchmark("tiny", tinyModel, opt, trainCfg, genCfg),
  runner.runFullBenchmark("small", smallModel, opt, trainCfg, genCfg),
  runner.runFullBenchmark("base", baseModel, opt, trainCfg, genCfg),
];

console.log(runner.compareMultiple(results));
```

## Using with Model Registry

```typescript
import { createModel, listModels } from "@/lib/minimind/experiments/ModelRegistry";

// Benchmark all registered models
for (const config of listModels()) {
  const model = createModel(config.name);
  const optimizer = new AdamWOptimizer(model.parameters(), { lr: 0.001 });
  const result = runner.runTrainingBenchmark(model, optimizer, {
    steps: 50, batchSize: 4, seqLen: 64, vocabSize: config.vocabSize,
  });
  console.log(`${config.label}: ${result.tokensPerSecond.toFixed(0)} tok/s`);
}
```

## Reproducibility

All benchmarks are deterministic when a seed is provided:

1. **Fixed seed** → same synthetic data every run
2. **Deterministic model init** → same initial weights
3. **Deterministic forward/backward** → same loss curve

To reproduce results:
1. Use the same seed for all runs
2. Save the benchmark config alongside results
3. Use `ModelRegistry` for consistent model initialization

## Golden Benchmarks

Three canonical benchmarks are provided in `experiments/golden/`:

1. **tiny-overfit.json** — Verifies loss reduction (>90%)
2. **attention-scaling.json** — Compares head counts (2, 4, 8)
3. **checkpoint-resume.json** — Verifies state preservation

See `experiment-guide.md` for how to run these.
