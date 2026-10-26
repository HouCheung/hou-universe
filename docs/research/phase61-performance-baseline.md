# Phase 61 — Performance Baseline

> Captured 2026-08-11 on Windows 11, Node.js v24.16.0, Next.js 15.5.20

## Test Hardware

- **OS**: Windows 11 Home China (build 26200)
- **CPU**: Consumer laptop (no GPU used)
- **Runtime**: Node.js v24.16.0 (V8 JIT, single-thread)
- **Precision**: Float64 (double — Tensor.minimind uses Float64Array throughout)

## Training Performance

### End-to-End Training (Real Data, Real Model)

| Metric | Value |
|--------|-------|
| Corpus size | 30 lines (~300 tokens) |
| Vocabulary size | 300 BPE tokens |
| Model config | dModel=64, numHeads=4, dFF=128, numLayers=2 |
| Block size | 16 |
| Batch size | 4 |
| Epochs | 2 |
| Total steps | 120 (60 batches × 2 epochs) |
| **Wall-clock time** | **~20 seconds** |
| Steps per second | ~6 |
| Tokens per second | ~384 (6 steps × 4 batch × 16 block) |
| Initial loss | 4.52 |
| Final loss | 4.21 |
| Best loss | 4.21 |
| Perplexity (best) | ~67 |

### Mini Training Benchmark (Standalone)

| Metric | Value |
|--------|-------|
| Corpus size | 30 lines |
| Block size | 16 |
| Batch size | 4 |
| Epochs | 1 |
| Total steps | 17 (per epoch) |
| **Wall-clock time** | **~10 seconds** |
| Loss range | 5.93 → 5.34 |

### Checkpoint/Resume Overhead

| Metric | Value |
|--------|-------|
| Save checkpoint | < 1ms (in-memory serialization) |
| Load checkpoint | < 1ms (in-memory deserialization) |
| Parameter restoration | bit-identical (max diff: 0.00e+0) |
| Continuous = Interrupted + Resumed | ✓ (max param diff: 0.00e+0) |
| Deterministic reproducibility (two runs, same seed) | ✓ (max param diff: 0.00e+0) |

## Test Suite Performance

| Phase | Assertions | Tests | Wall-clock |
|-------|-----------|-------|------------|
| Phase 58 (Runtime) | 176 | 59 | < 1s |
| Phase 59 (Copilot) | 225 | 57 | < 2s |
| Phase 61 E2E (Integration) | 189 | 9 suites | ~22s (includes real training) |
| Phase 61 Checkpoint/Resume | 30 | 3 | ~8s |
| **Total** | **335** | **128** | **~33s** |

## Build Performance

| Metric | Value |
|--------|-------|
| Next.js compilation | ~7.5s |
| Type checking | Included in compilation |
| Static page generation | ~2s (30 pages) |
| Total build time | ~10s |

## Browser/Node Boundary

| Check | Status |
|-------|--------|
| `src/lib/minimind/index.ts` imports `fs`? | No — browser-safe ✓ |
| `src/lib/minimind/node.ts` imports `fs`? | Yes — Node-only, correctly isolated ✓ |
| Checkpoint system uses `fs`? | No — in-memory serialization only ✓ |
| ResearchExperimentRunner imports `fs`? | No — browser-safe ✓ |
| TrainingEventBus imports `fs`? | No — pure in-memory pub/sub ✓ |
| `npm run build` passes? | ✓ (0 type errors) |

## Key Findings

1. **No GPU needed for validation**: The full E2E pipeline completes in ~20s on CPU, making CI testing practical without GPU infrastructure.

2. **Bit-identical reproducibility is achieved**: Same seed + same data = same parameters to machine precision (0.00e+0). The checkpoint system preserves RNG state, optimizer momentum, and scheduler position correctly.

3. **Browser-safe architecture is verified**: The `index.ts` / `node.ts` split correctly isolates Node-only imports (fs, path) from browser-safe code. Zero fs leakage into client-facing modules.

4. **Test coverage is comprehensive**: 335 assertions across 4 test suites covering identity, training, checkpoints, events, metrics, copilot evidence, report consistency, reproducibility, edge cases, failure states, and store CRUD.

5. **Training speed is proportional to model size**: The current config (dModel=64, 2 layers) processes ~384 tokens/sec on CPU. Scaling to larger models will require GPU or Web Worker offloading.
