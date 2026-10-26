# MiniMind Architecture Validation

## Overview

This document describes the architecture validation framework for MiniMind. It covers:

1. Model configuration registry
2. Parameter counting and verification
3. Architecture correctness checks
4. Ablation experiment methodology

## Model Configuration Registry

### Available Presets

| Config | dModel | Heads | dFF | Layers | MaxSeqLen | Est. Params |
|--------|--------|-------|-----|--------|-----------|-------------|
| Tiny   | 128    | 4     | 512 | 4      | 256       | ~600K       |
| Small  | 256    | 8     | 1024| 6      | 512       | ~12M        |
| Base   | 512    | 8     | 2048| 8      | 512       | ~50M        |

### Using the Registry

```typescript
import {
  getModelConfig,
  listModels,
  createModel,
} from "@/lib/minimind/experiments/ModelRegistry";

// Inspect a config
const config = getModelConfig("tiny");
console.log(config.dModel);    // 128
console.log(config.numLayers); // 4

// List all available
for (const m of listModels()) {
  console.log(`${m.label}: ${m.estimatedParams.toLocaleString()} params`);
}

// Create a model directly
const model = createModel("small");

// Create with custom vocabulary size
const customModel = createModel("base", 16000);
```

### Registering Custom Configs

```typescript
import { registerModel } from "@/lib/minimind/experiments/ModelRegistry";

registerModel({
  name: "experimental",
  label: "Experimental Model",
  description: "Custom architecture for research",
  vocabSize: 32000,
  dModel: 384,
  numHeads: 12,
  dFF: 1536,
  numLayers: 6,
  maxSeqLen: 512,
  eps: 1e-6,
  estimatedParams: 0, // auto-computed if 0
});
```

## Parameter Verification

### Using ModelStats

```typescript
import { ModelStats } from "@/lib/minimind/evaluation/ModelStats";

const model = createModel("tiny");
const report = ModelStats.summarize(model);

console.log(report.totalParameters);     // Exact parameter count
console.log(report.formattedSummary);    // Pretty-printed table

// Programmatic access
console.log(report.layerBreakdown);      // Per-layer breakdown
console.log(report.memory);              // Memory estimates
console.log(report.estimatedFlops);      // FLOPs estimate
```

### Parameter Count Formula

For a GPT-2 Pre-Norm architecture:

```
Embedding:     V × D
Per layer:
  QKV:        3 × D × D
  Output:     D × D
  FFN Gate:   dFF × D
  FFN Up:     dFF × D
  FFN Down:   D × dFF
  RMSNorm×2:  2 × D
Final Norm:   D
LM Head:      D × V

Total ≈ 2×V×D + L × (4×D² + 3×dFF×D + 2×D) + D
```

### Expected Parameter Counts

| Model | Vocab=1000 | Vocab=6400 | Vocab=32000 |
|-------|-----------|-----------|-------------|
| Tiny  | ~131K     | ~591K     | ~2.5M       |
| Small | ~550K     | ~2.1M     | ~12.7M      |
| Base  | ~1.4M     | ~5.2M     | ~50.3M      |

## Architecture Correctness Checks

### 1. Shape Propagation

Verify tensor shapes through the full forward pass:

```
Input:    [B, S]      token IDs
Embed:    [B, S, D]   embeddings
Block 0:  [B, S, D]   after attention + FFN
...
Block L:  [B, S, D]   after final block
Norm:     [B, S, D]   after final RMSNorm
LM Head:  [B, S, V]   logits
```

### 2. Gradient Flow

Verify gradients reach all parameters:

```typescript
const model = createModel("tiny");
const input = Tensor.fromArray([[1, 2, 3, 4]]);
const logits = model.forward(input);
const loss = logits.sum();
loss.backward();

// Every parameter should have non-null grad
for (const { name, parameter } of model.namedParameters()) {
  console.assert(parameter.grad !== null, `No grad for ${name}`);
  console.assert(
    parameter.grad!.some(v => v !== 0),
    `Zero grad for ${name}`
  );
}
```

### 3. Weight Tying (Optional)

By default, embedding and LM head weights are NOT tied in MiniMind.
This matches GPT-2 practice. To enable weight tying, the model
would need to be modified to share the weight tensor.

## Ablation Framework

### Running an Ablation Study

```typescript
import { Ablation } from "@/lib/minimind/experiments/Ablation";
import { getModelConfig } from "@/lib/minimind/experiments/ModelRegistry";

const config = getModelConfig("tiny");
const ablation = Ablation.fromModelConfig("width-study", config);

// Add variants — each changes one dimension
ablation.addVariant("half-width", { dModel: 64 },
  "Half model width to test capacity impact");
ablation.addVariant("double-width", { dModel: 256 },
  "Double model width to test scaling");
ablation.addVariant("half-depth", { numLayers: 2 },
  "Half layers to test depth impact");
ablation.addVariant("double-depth", { numLayers: 8 },
  "Double layers to test depth impact");

// Build comparison table (requires running each variant)
const baselineResult = { /* run baseline */ };
const variantResults = [ /* run each variant */ ];
const table = ablation.buildComparisonTable(baselineResult, variantResults);
```

### Ablation Dimensions

| Dimension | What It Tests | Typical Values |
|-----------|--------------|----------------|
| dModel    | Model width / capacity | 64, 128, 256, 512 |
| numLayers | Model depth | 2, 4, 6, 8, 12 |
| numHeads  | Attention parallelism | 2, 4, 8, 12 |
| dFF       | FFN capacity | dModel × 2, × 4, × 8 |
| vocabSize | Vocabulary coverage | 1K, 8K, 32K |
| maxSeqLen | Context length | 64, 128, 256, 512 |

## Validation Checklist

Before claiming MiniMind is "working", verify:

- [ ] All registered models instantiate without errors
- [ ] Parameter counts match expected values (+/- 1%)
- [ ] Forward pass produces correct shapes at each layer
- [ ] Backward pass produces gradients for all parameters
- [ ] Gradients are non-zero (model is learning)
- [ ] Loss decreases monotonically on a small overfit test
- [ ] Checkpoint save/restore preserves exact logits
- [ ] All head configurations (2, 4, 8) train without NaN
