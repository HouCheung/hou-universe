// ============================================================
// GenerationEvaluator — Evaluate text generation quality
// ============================================================
// Phase 44: Evaluates autoregressive text generation quality
// by generating text from fixed prompts and measuring both
// quantitative metrics and qualitative changes.
//
// Primary use case: compare generation output before and after
// training to prove the model has actually learned something.
//
// Usage:
//   const evaluator = new GenerationEvaluator(model, tokenizer);
//   const result = evaluator.evaluate(["Once upon a time", "The cat"]);
//   // Compare before/after training:
//   const comparison = evaluator.compare(beforeResult, afterResult);
//   console.log(comparison.changed); // true if model learned something
// ============================================================

import { Tensor } from "../core/Tensor";
import { crossEntropyLoss } from "../core/loss/CrossEntropyLoss";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { BPETokenizer } from "../tokenizer/BPETokenizer";
import { tokenBytesOf } from "../research/capability-eval/utf8";
import {
  BOUNDARY_STATE,
  IncrementalUtf8Decoder,
  appendUtf8Bytes,
  applyLegalityMask,
  buildLegalCandidateMask,
  type Utf8StreamState,
} from "./utf8Constrained";

// ============================================================
// Types
// ============================================================

/**
 * Result of evaluating generation on a single prompt.
 */
export interface GenerationEvalResult {
  /** The prompt text */
  prompt: string;
  /** Full generated text (prompt + continuation) */
  generatedText: string;
  /** Token IDs generated (excluding prompt) */
  generatedIds: number[];
  /** Number of tokens generated */
  tokenCount: number;
  /** Average log-probability of the generated tokens (higher = more confident) */
  avgLogProb: number;
  /** Perplexity of the generated sequence */
  perplexity: number;
  /** Why generation stopped: "maxTokens" | "eos" | "error" */
  stopReason: "maxTokens" | "eos" | "error";
  /**
   * UTF-8 constrained-decoding diagnostics.
   *
   * `enforced` describes the decoding condition; it says nothing about the
   * model's learned language capability.
   */
  utf8?: {
    enforced: boolean;
    /** Every candidate was illegal at this step — generation stopped. */
    emptyCandidateStop: boolean;
    /** A trailing incomplete sequence was withheld at flush. */
    droppedIncompleteTail: boolean;
    /** First malformed interior byte, or -1. */
    invalidByteOffset: number;
  };
}

/**
 * Comparison between two generation evaluation results.
 */
export interface GenerationComparison {
  /** The prompt text */
  prompt: string;
  /** Generated text before training */
  beforeText: string;
  /** Generated text after training */
  afterText: string;
  /** Whether the generated text changed */
  changed: boolean;
  /** Difference in avg log-probability (after - before, higher = more confident) */
  logProbDelta: number;
  /** Difference in perplexity (after - before) */
  perplexityDelta: number;
}

/**
 * Configuration for generation evaluation.
 */
export interface GenerationEvalOptions {
  /** Maximum tokens to generate per prompt (default: 30) */
  maxTokens?: number;
  /** Temperature for sampling (default: 0.8). Use 0 for greedy. */
  temperature?: number;
  /** Top-K filtering (default: 40) */
  topK?: number;
  /** Top-P nucleus sampling (default: 0.9) */
  topP?: number;
  /** Random seed for reproducibility (omit for non-deterministic) */
  seed?: number;
  /** EOS token ID (default: 3) */
  eosTokenId?: number;
  /**
   * Enforce P012 UTF-8 legality at the sampling boundary (default: true).
   *
   * This is a decoding constraint, not a capability upgrade. The option
   * exists so diagnostics can measure the same generation without the
   * constraint; production chat always leaves it at the default.
   */
  enforceUtf8?: boolean;
  /**
   * REAL token streaming callback.
   * Fires immediately after each token is generated and decoded.
   * Called with the decoded token string and its index (0-based).
   * Phase 71: Enables real-time token-by-token chat display.
   */
  onToken?: (token: string, tokenIndex: number) => void;
  /**
   * AbortSignal for cooperative cancellation.
   * Checked before each token generation step.
   * Phase 71: Enables Stop button to halt generation mid-stream.
   */
  signal?: AbortSignal;
}

// ============================================================
// GenerationEvaluator
// ============================================================

export class GenerationEvaluator {
  private model: TensorMiniMindModel;
  private tokenizer: BPETokenizer;

  /**
   * @param model     - Model to evaluate generation from
   * @param tokenizer - BPETokenizer for encode/decode
   */
  constructor(model: TensorMiniMindModel, tokenizer: BPETokenizer) {
    this.model = model;
    this.tokenizer = tokenizer;
  }

  /**
   * Evaluate generation quality on a set of prompts.
   *
   * For each prompt, generates up to `maxTokens` tokens autoregressively
   * and computes the average log-probability and perplexity of the
   * generated sequence under the model.
   *
   * @param prompts - Array of prompt strings
   * @param options - Generation configuration
   * @returns Array of per-prompt results
   */
  evaluate(
    prompts: string[],
    options?: GenerationEvalOptions
  ): GenerationEvalResult[] {
    const {
      maxTokens = 30,
      temperature = 0.8,
      topK = 40,
      topP = 0.9,
      seed = 42,
      eosTokenId = 3,
      enforceUtf8 = true,
    } = options ?? {};

    const results: GenerationEvalResult[] = [];
    // Deterministic by default. The seed is plumbed explicitly into the
    // sampler — no global Math.random / Random monkey patch is involved.
    const random = createSeededRNG(seed);

    for (const prompt of prompts) {
      const result = this.evaluateSingle(prompt, {
        maxTokens,
        temperature,
        topK,
        topP,
        random,
        eosTokenId,
        enforceUtf8,
        onToken: options?.onToken,
        signal: options?.signal,
      });
      results.push(result);
    }

    return results;
  }

  /**
   * Compare two generation evaluation result sets (typically before/after training).
   *
   * Matches results by prompt text and reports differences.
   *
   * @param before - Evaluation results before training
   * @param after  - Evaluation results after training
   * @returns Array of per-prompt comparisons
   */
  compare(
    before: GenerationEvalResult[],
    after: GenerationEvalResult[]
  ): GenerationComparison[] {
    const afterMap = new Map<string, GenerationEvalResult>();
    for (const r of after) {
      afterMap.set(r.prompt, r);
    }

    const comparisons: GenerationComparison[] = [];

    for (const beforeResult of before) {
      const afterResult = afterMap.get(beforeResult.prompt);
      if (!afterResult) continue;

      comparisons.push({
        prompt: beforeResult.prompt,
        beforeText: beforeResult.generatedText,
        afterText: afterResult.generatedText,
        changed: beforeResult.generatedText !== afterResult.generatedText,
        logProbDelta: afterResult.avgLogProb - beforeResult.avgLogProb,
        perplexityDelta: afterResult.perplexity - beforeResult.perplexity,
      });
    }

    return comparisons;
  }

  // ============================================================
  // Internal
  // ============================================================

  /**
   * Evaluate generation for a single prompt.
   */
  private evaluateSingle(
    prompt: string,
    opts: {
      maxTokens: number;
      temperature: number;
      topK: number;
      topP: number;
      random: () => number;
      eosTokenId: number;
      enforceUtf8: boolean;
      onToken?: (token: string, tokenIndex: number) => void;
      signal?: AbortSignal;
    }
  ): GenerationEvalResult {
    const {
      maxTokens,
      temperature,
      topK,
      topP,
      random,
      eosTokenId,
      enforceUtf8,
      onToken,
      signal,
    } = opts;

    const promptIds = prompt ? this.tokenizer.encode(prompt) : [];
    const generatedIds: number[] = [];
    const currentIds = [...promptIds];
    const idToToken = this.tokenizer.getVocabulary().idToToken;
    const decoder = new IncrementalUtf8Decoder(idToToken);
    let state: Utf8StreamState = BOUNDARY_STATE;
    let totalLogProb = 0;
    let stopReason: "maxTokens" | "eos" | "error" = "maxTokens";
    let emptyCandidateStop = false;

    for (let step = 0; step < maxTokens; step++) {
      // Cooperative cancellation check (Phase 71)
      if (signal?.aborted) {
        stopReason = "error";
        break;
      }

      // Truncate to context window
      const maxCtx = 128;
      const ctx =
        currentIds.length > maxCtx
          ? currentIds.slice(currentIds.length - maxCtx)
          : currentIds;

      const input = Tensor.fromArray([ctx]);
      let nextTokenId = -1;
      let tokenLogProb = 0;

      Tensor.noGrad(() => {
        const logits = this.model.forward(input); // [1, seqLen, vocabSize]

        // Extract logits at the last position
        const logitArr = logits.toArray() as number[][][];
        const seqLen = logitArr[0].length;
        const lastLogits = logitArr[0][Math.min(ctx.length - 1, seqLen - 1)];

        // P012 legality at the sampling boundary. The empty set is handled
        // explicitly: generation stops instead of passing an all -Infinity
        // distribution to the sampler.
        let samplingLogits = lastLogits;
        if (enforceUtf8) {
          const mask = buildLegalCandidateMask(
            idToToken,
            lastLogits.length,
            state,
            eosTokenId
          );
          if (mask.empty) {
            emptyCandidateStop = true;
            return;
          }
          samplingLogits = applyLegalityMask(lastLogits, mask.allowed);
        }

        // Sample next token
        nextTokenId = sampleToken(samplingLogits, random, {
          temperature,
          topK,
          topP,
        });

        if (nextTokenId < 0) {
          emptyCandidateStop = true;
          return;
        }

        // Compute log-probability of the chosen token against the SAME
        // distribution the sampler used (post-mask when constrained).
        const scaled = samplingLogits.map((l: number) =>
          temperature > 0 ? l / temperature : l
        );
        const maxL = Math.max(...scaled);
        const expSum = scaled.reduce(
          (s: number, l: number) => s + Math.exp(l - maxL),
          0
        );
        const logProb = scaled[nextTokenId] - maxL - Math.log(expSum);
        tokenLogProb = logProb;
      });

      if (emptyCandidateStop) {
        stopReason = "error";
        break;
      }

      // EOS is a control token. It terminates generation but is never
      // appended to the visible text or counted as a response token.
      if (nextTokenId === eosTokenId) {
        stopReason = "eos";
        break;
      }

      generatedIds.push(nextTokenId);
      currentIds.push(nextTokenId);
      totalLogProb += tokenLogProb;

      // Advance the byte phase, then emit only newly decodable text.
      if (enforceUtf8) {
        const { bytes, outOfRangeIdCount } = tokenBytesOf(idToToken, [
          nextTokenId,
        ]);
        if (outOfRangeIdCount === 0) {
          state = appendUtf8Bytes(state, Array.from(bytes)).state;
        }
      }

      const delta = decoder.pushToken(nextTokenId);
      if (onToken) {
        onToken(delta, generatedIds.length - 1);
      }
    }

    const finish = decoder.finish();
    // Unconstrained diagnostics show the raw decode (including U+FFFD);
    // production constrained generation reports the flushed decoder text.
    const decodedContinuation = enforceUtf8
      ? finish.text
      : this.tokenizer.decode(generatedIds);
    const tokenCount = generatedIds.length;
    const avgLogProb = tokenCount > 0 ? totalLogProb / tokenCount : 0;
    const perplexity =
      tokenCount > 0 ? Math.exp(Math.min(-avgLogProb, 709)) : Infinity;

    return {
      prompt,
      generatedText: prompt + decodedContinuation,
      generatedIds,
      tokenCount,
      avgLogProb,
      perplexity,
      stopReason,
      utf8: {
        enforced: enforceUtf8,
        emptyCandidateStop,
        droppedIncompleteTail: finish.droppedIncompleteTail,
        invalidByteOffset: finish.invalidByteOffset,
      },
    };
  }
}

// ============================================================
// Sampling helpers
// ============================================================

/**
 * Sample a token from logits using temperature + top-k + top-p.
 */
function sampleToken(
  logits: number[],
  random: () => number,
  opts: { temperature: number; topK: number; topP: number }
): number {
  const { temperature, topK, topP } = opts;

  // Greedy
  if (temperature === 0) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let i = 0; i < logits.length; i++) {
      if (logits[i] > maxVal) {
        maxVal = logits[i];
        maxIdx = i;
      }
    }
    return maxIdx;
  }

  // Temperature scaling
  const scaled = logits.map((l) => l / Math.max(temperature, 1e-8));

  // Softmax
  const maxLogit = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - maxLogit));
  const expSum = exps.reduce((s, v) => s + v, 0);
  const probs = exps.map((e) => e / expSum);

  // Top-K
  if (topK > 0 && topK < probs.length) {
    const indexed = probs.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => b.p - a.p);
    const cutoffIdx = Math.min(topK, indexed.length) - 1;
    const cutoff = indexed[cutoffIdx].p;
    for (let i = 0; i < probs.length; i++) {
      if (probs[i] < cutoff) probs[i] = 0;
    }
    const sum = probs.reduce((s, p) => s + p, 0);
    if (sum > 0) for (let i = 0; i < probs.length; i++) probs[i] /= sum;
  }

  // Top-P
  if (topP < 1.0 && topP > 0) {
    const indexed = probs.map((p, i) => ({ p, i }));
    indexed.sort((a, b) => b.p - a.p);
    let cumSum = 0;
    const keep = new Set<number>();
    for (const { p, i } of indexed) {
      cumSum += p;
      keep.add(i);
      if (cumSum >= topP) break;
    }
    for (let i = 0; i < probs.length; i++) {
      if (!keep.has(i)) probs[i] = 0;
    }
    const sum = probs.reduce((s, p) => s + p, 0);
    if (sum > 0) for (let i = 0; i < probs.length; i++) probs[i] /= sum;
  }

  // Sample
  const r = random();
  let cumProb = 0;
  let lastPositive = -1;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] <= 0) continue;
    lastPositive = i;
    cumProb += probs[i];
    if (r < cumProb) return i;
  }

  // Floating-point fallback: return the last LEGAL candidate, never an
  // index that the mask set to -Infinity / probability 0.
  return lastPositive;
}

/**
 * Mulberry32 seeded RNG.
 */
function createSeededRNG(seed: number): () => number {
  let state = (seed | 0) + 0x6d2b79f5;
  return () => {
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    state = state + 0x6d2b79f5 | 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
