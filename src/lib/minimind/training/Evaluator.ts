// ============================================================
// Evaluator — Model evaluation pipeline for MiniMind
// ============================================================
// Phase 42: Standalone evaluation function that runs a model
// over a dataset and returns loss, perplexity, token accuracy,
// and sample predictions.
//
// Features:
//   - noGrad mode: evaluation does not build computation graph
//   - Per-sample tracking: detailed metrics per batch
//   - Aggregated results: mean loss, perplexity, accuracy
//   - Compatible with Trainer and standalone usage
//
// Usage:
//   const result = evaluate({ model, dataset, tokenizer });
//   console.log(result.loss, result.perplexity, result.tokenAccuracy);
// ============================================================

import { Tensor } from "../core/Tensor";
import { crossEntropyLoss } from "../core/loss/CrossEntropyLoss";
import { Perplexity } from "./Perplexity";
import { collateBatch } from "./Trainer";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { DataLoader } from "../data/DataLoader";
import type { TextSample } from "../data/TextDataset";
import type { MiniTokenizer } from "../tokenizer/MiniTokenizer";

// ============================================================
// Types
// ============================================================

/**
 * Result of an evaluation run.
 */
export interface EvaluationResult {
  /** Average cross-entropy loss over the evaluation dataset */
  loss: number;
  /** Perplexity = exp(loss) */
  perplexity: number;
  /** Token-level prediction accuracy (fraction of correctly predicted tokens) */
  tokenAccuracy: number;
  /** Total number of tokens evaluated */
  totalTokens: number;
  /** Number of batches in the evaluation dataset */
  numBatches: number;
  /** Per-batch metrics for detailed analysis */
  batchMetrics: BatchMetrics[];
  /** Sample predictions: for each batch, a few examples of (input, target, predicted) */
  samples: PredictionSample[];
}

/**
 * Per-batch evaluation metrics.
 */
export interface BatchMetrics {
  /** Batch index (0-based) */
  batchIndex: number;
  /** Loss for this batch */
  loss: number;
  /** Perplexity for this batch */
  perplexity: number;
  /** Token accuracy for this batch */
  tokenAccuracy: number;
  /** Number of tokens in this batch */
  numTokens: number;
}

/**
 * A single prediction sample for qualitative analysis.
 */
export interface PredictionSample {
  /** The input token IDs (context) */
  inputTokens: number[];
  /** The ground-truth target token IDs */
  targetTokens: number[];
  /** The model's predicted token IDs (argmax over vocabulary) */
  predictedTokens: number[];
  /** The decoded text for input */
  inputText: string;
  /** The decoded text for target */
  targetText: string;
  /** The decoded text for prediction */
  predictedText: string;
}

/**
 * Configuration for evaluate().
 */
export interface EvaluateOptions {
  /** Model to evaluate */
  model: TensorMiniMindModel;
  /** DataLoader providing evaluation batches */
  loader: DataLoader<TextSample>;
  /** Tokenizer for decoding samples (optional — omit to skip sample collection) */
  tokenizer?: MiniTokenizer;
  /** Maximum number of sample predictions to collect (default: 3) */
  maxSamples?: number;
}

// ============================================================
// evaluate()
// ============================================================

/**
 * Evaluate a model on a dataset.
 *
 * Runs the model in noGrad mode — no computation graph is built,
 * no gradients are accumulated, and parameter gradients remain unchanged.
 *
 * Metrics computed:
 *   - loss: mean cross-entropy over all tokens
 *   - perplexity: exp(loss)
 *   - tokenAccuracy: fraction of tokens where argmax(logits) == target
 *
 * @param options - Model, loader, tokenizer, and sample count
 * @returns Aggregated evaluation results
 */
export function evaluate(options: EvaluateOptions): EvaluationResult {
  const {
    model,
    loader,
    tokenizer,
    maxSamples = 3,
  } = options;

  const batchMetrics: BatchMetrics[] = [];
  const samples: PredictionSample[] = [];
  let totalLoss = 0;
  let totalCorrect = 0;
  let totalTokens = 0;
  let batchIndex = 0;

  // Run evaluation with gradient tracking disabled on all parameters
  Tensor.noGrad(() => {
    for (const batch of loader) {
      const { inputIds, targets } = collateBatch(batch);

      // Forward pass (no graph built since parameters have requiresGrad=false)
      const logits = model.forward(inputIds);

      // Compute loss
      const lossTensor = crossEntropyLoss(logits, targets);
      const lossVal = lossTensor.item();

      // ── Compute token accuracy ──
      // logits shape: [B, S, V], targets: B × S
      const B = logits.shape[0];
      const S = logits.shape[1];
      const V = logits.shape[2];

      let batchCorrect = 0;
      let batchTokens = 0;

      for (let b = 0; b < B; b++) {
        for (let s = 0; s < S; s++) {
          // Find argmax over vocabulary at position [b, s]
          const offset = (b * S + s) * V;
          let maxIdx = 0;
          let maxVal = logits.data[offset];
          for (let v = 1; v < V; v++) {
            if (logits.data[offset + v] > maxVal) {
              maxVal = logits.data[offset + v];
              maxIdx = v;
            }
          }

          if (maxIdx === targets[b][s]) {
            batchCorrect++;
          }
          batchTokens++;
        }
      }

      // ── Track batch metrics ──
      batchMetrics.push({
        batchIndex,
        loss: lossVal,
        perplexity: Perplexity.fromLoss(lossVal),
        tokenAccuracy: batchTokens > 0 ? batchCorrect / batchTokens : 0,
        numTokens: batchTokens,
      });

      // ── Collect prediction samples ──
      if (samples.length < maxSamples && tokenizer) {
        // Take the first sequence from the batch as a sample
        const b = 0;
        const predictedTokens: number[] = [];

        for (let s = 0; s < S; s++) {
          const offset = s * V;
          let maxIdx = 0;
          let maxVal = logits.data[offset];
          for (let v = 1; v < V; v++) {
            if (logits.data[offset + v] > maxVal) {
              maxVal = logits.data[offset + v];
              maxIdx = v;
            }
          }
          predictedTokens.push(maxIdx);
        }

        const inputIds = batch[0].inputIds;
        const targetIds = batch[0].targetIds;

        samples.push({
          inputTokens: [...inputIds],
          targetTokens: [...targetIds],
          predictedTokens,
          inputText: tokenizer.decode(inputIds),
          targetText: tokenizer.decode(targetIds),
          predictedText: tokenizer.decode(predictedTokens),
        });
      }

      totalLoss += lossVal;
      totalCorrect += batchCorrect;
      totalTokens += batchTokens;
      batchIndex++;
    }
  }, model.parameters());

  // ── Compute aggregate metrics ──
  const numBatches = batchIndex;
  const avgLoss = numBatches > 0 ? totalLoss / numBatches : 0;
  const ppl = Perplexity.fromLoss(avgLoss);
  const accuracy = totalTokens > 0 ? totalCorrect / totalTokens : 0;

  return {
    loss: avgLoss,
    perplexity: ppl,
    tokenAccuracy: accuracy,
    totalTokens,
    numBatches,
    batchMetrics,
    samples,
  };
}

/**
 * Quick evaluation: just return loss and perplexity.
 *
 * Lightweight version of evaluate() that skips sample collection
 * and per-batch metrics. Faster for frequent evaluation during training.
 *
 * @param model  - Model to evaluate
 * @param loader - DataLoader providing evaluation batches
 * @returns { loss: number, perplexity: number }
 */
export function evaluateQuick(
  model: TensorMiniMindModel,
  loader: DataLoader<TextSample>
): { loss: number; perplexity: number } {
  const result = evaluate({ model, loader, maxSamples: 0 });
  return {
    loss: result.loss,
    perplexity: result.perplexity,
  };
}
