# Phase 38 Training Runtime Design

**Date:** 2026-08-06
**Phase:** 38
**Status:** Approved
**Depends on:** Phase 30-37 (Tensor Autograd, Parameter, Linear, Embedding, FFN, Attention, Transformer, Model)

## 1. Goal

Enable the first true end-to-end trainable loop using the Tensor autograd backend:
`forward → cross-entropy loss → backward → SGD update → repeat`

## 2. Files

### New Files

| File | Purpose |
|------|---------|
| `core/loss/CrossEntropyLoss.ts` | Tensor cross-entropy with autograd graph, causal shift |
| `core/optim/Optimizer.ts` | Abstract Optimizer base class |
| `core/optim/SGD.ts` | In-place SGD: `W -= lr * grad` |
| `core/optim/index.ts` | Barrel export |
| `training/TrainingLoop.ts` | Orchestrator: forward → loss → backward → step |
| `training/index.ts` | Barrel export |
| `core/__tests__/loss.test.ts` | Forward, backward, gradient check for CrossEntropyLoss |
| `core/__tests__/optim.test.ts` | SGD update + zeroGrad verification |
| `core/__tests__/tiny_train.test.ts` | End-to-end: "hello world" convergence demo |

### Modified Files

| File | Change |
|------|--------|
| `core/index.ts` | Add loss + optim exports |
| `core/__tests__/run.ts` | Register new test suites |

## 3. CrossEntropyLoss

**Signature:** `crossEntropyLoss(logits: Tensor [B,S,V], targets: number[][]): Tensor (scalar)`

**Forward:**
- Causal shift: `logits[:, :-1]` predicts `targets[:, 1:]`
- Per position: `softmax(logits[b,s]) → probs`, then `-log(probs[target[b][s+1]])`
- Mean reduction over all valid positions

**Backward (autograd closure):**
- Saves softmax probs and target indices
- `∂CE/∂logit_i = probs_i - one_hot(target)_i` (scaled by 1/count)
- Zero gradient for the last logit position (no target)

**Gradient check tolerance:** 1e-4 via central finite differences

## 4. Optimizer

**Abstract class:**
```typescript
abstract class Optimizer {
  parameters: Parameter[];
  abstract step(): void;
  zeroGrad(): void; // iterates parameters, calls param.zeroGrad()
}
```

**SGDOptimizer:**
- `step()`: `param.data[i] -= lr * param.grad[i]` — in-place Float64Array update
- No new Tensor creation
- `step()` preserves `requiresGrad=true`

## 5. TrainingLoop

**Input:** model, optimizer, criterion, dataset (token ID pairs), epochs

**Loop:**
```
for epoch:
  logits = model.forward(inputIds)   // [B,S] → [B,S,V]
  loss = criterion(logits, targets)  // scalar Tensor
  loss.backward()                    // autograd
  optimizer.step()                   // W -= lr * grad
  optimizer.zeroGrad()               // reset grads
  record { epoch, loss, parameterNorm }
```

**Returns:** `TrainingHistory[]` with `{ epoch, loss, parameterNorm }`

## 6. Tiny Train Demo

- Model: `TensorMiniMindModel.tiny(vocabSize=256)`
- Data: "hello world" tokenized
- Epochs: 20
- Verification: `afterLoss < beforeLoss`, parameters actually changed

## 7. Out of Scope

- AdamW / momentum / weight decay
- Learning rate scheduling
- Gradient clipping
- Batch training > 1
- Modifying old MiniMindModel or pretrain/ module
- AI Lab / UI changes
