# RoPE (Rotary Position Embedding)

> **MiniMind Core Module** — Phase 12
>
> Educational, transparent, and extensible Rotary Position Embedding implementation.

## Overview

RoPE injects position information into token representations by rotating Query and Key vectors in 2D subspaces. The rotation angle is proportional to the token's absolute position, but the resulting inner product `Q·K^T` depends only on relative position differences — this is the magic of RoPE.

## Architecture

```
Theory (docs/minimind/03-rope.md)
    ↓
Registry (src/data/minimind/rope-registry.ts)
    ↓
Implementation (src/lib/minimind/rope/)
    ├── types.ts           — Type definitions
    ├── math.ts            — Pure math engine
    ├── RotaryEmbedding.ts — Main class
    └── index.ts           — Barrel exports
    ↓
Playground (future)
    ↓
Experience (future)
```

## Quick Start

```ts
import { RotaryEmbedding } from "@/lib/minimind";

// Create a RoPE instance (MiniMind default: headDim=64, theta=10000)
const rope = new RotaryEmbedding({ headDim: 64, theta: 10000, maxSeqLen: 512 });

// Inspect frequency bands
const freqs = rope.getFrequencies();
// → [1.0, 0.9647, 0.9305, ..., 0.0001]  (32 frequency bands)

// Rotate a single vector at position 3
const q = new Float64Array(64); // ... your Q vector
const result = rope.rotate(q, 3);
console.log(result.normPreserved); // → true (isometry verified)

// Batch rotate Q and K for a whole sequence
const qVecs = [/* seqLen vectors of length 64 */];
const kVecs = [/* seqLen vectors of length 64 */];
const { rotatedQuery, rotatedKey } = rope.forward(qVecs, kVecs);
```

## API Reference

### `RotaryEmbedding` (main class)

| Method | Description |
|--------|-------------|
| `getFrequencies()` | Return all frequency bands (`headDim/2` values) |
| `getAngles(pos)` | Return rotation angles for a given position |
| `getConfig()` | Return `{ headDim, theta, maxSeqLen }` |
| `getCache()` | Return precomputed cos/sin tables |
| `rotate(x, pos)` | Apply RoPE to a single vector with full trace |
| `rotateBatch(vecs, pos)` | Batch-rotate multiple vectors |
| `forward(qVecs, kVecs)` | Apply RoPE to Q and K for a full sequence |
| `verifyNormInvariance(x, pos)` | Verify rotation preserves L2 norm |

### Math Utilities (also exported directly)

| Function | Description |
|----------|-------------|
| `getFrequencies(headDim, theta)` | Compute frequency array |
| `getAngles(position, frequencies)` | Compute angles for one position |
| `getAllAngles(maxSeqLen, frequencies)` | Compute all position angles |
| `frequencyCache(maxSeqLen, headDim, theta)` | Precompute cos/sin tables |
| `rotateVector(x, cos, sin)` | Apply 2D per-pair rotation |
| `applyRotation(x, position, frequencies)` | Full rotation with trace |
| `applyQKRotation(q, k, frequencies)` | Batch Q/K rotation |
| `l2Norm(x)` | Compute L2 norm |

## Key Design Decisions

1. **Precomputed cache** — cos/sin values computed once at init, zero trig calls during forward
2. **Per-pair trace** — every rotation records before/after values for visualization
3. **Norm verification** — automatic isometry check on every rotation
4. **Zero dependencies** — pure TypeScript, no external math libraries
5. **Educational transparency** — all internal state publicly inspectable

## Test Checklist

- [ ] Rotation preserves vector norm (`verifyNormInvariance`)
- [ ] Position 0 rotation equals identity (`angle = 0 → cos=1, sin=0`)
- [ ] Higher positions produce larger rotation angles
- [ ] High-frequency bands rotate faster than low-frequency bands
- [ ] Frequency bands span from ~1.0 to ~1/theta
- [ ] Batch rotation produces same results as sequential single rotations
- [ ] Input validation rejects odd headDim, negative theta, out-of-range positions
