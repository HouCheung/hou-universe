// ============================================================
// MiniMind Inference — TensorGenerator.ts
// ============================================================
// Tensor-based autoregressive text generation.
//
// Unlike the existing InferenceEngine (which uses legacy
// MiniMindModel + number[][]), this Generator works directly
// with TensorMiniMindModel using the Tensor autograd backend.
//
// Supports all standard sampling strategies:
//   - greedy (temperature=0 or argmax)
//   - temperature scaling
//   - top-k filtering
//   - top-p (nucleus) filtering
//
// Usage:
//   const gen = new TensorGenerator(model, tokenizer);
//   const text = gen.generate("Once upon a time", {
//     maxTokens: 50, temperature: 0.8, topK: 40, topP: 0.9,
//   });
// ============================================================

import { Tensor } from "../core/Tensor";
import { Random } from "../core/random/Random";
import { SeededRandom } from "../core/random/SeededRandom";
import type { TensorMiniMindModel } from "../model/TensorMiniMindModel";
import type { BPETokenizer } from "../tokenizer/BPETokenizer";

// ============================================================
// Types
// ============================================================

export interface GenerationOptions {
  /** Maximum tokens to generate (excluding prompt) */
  maxTokens: number;
  /** Temperature (0 = greedy/argmax). Default: 0.8 */
  temperature?: number;
  /** Top-K filtering (0 = disabled). Default: 40 */
  topK?: number;
  /** Top-P nucleus sampling (1.0 = disabled). Default: 0.9 */
  topP?: number;
  /** Random seed for reproducibility. Omit for non-deterministic. */
  seed?: number;
  /** Stop generation when this token ID is produced. Default: 3 (<eos>) */
  eosTokenId?: number;
  /** Maximum context length (older tokens are truncated). Default: 256 */
  maxContext?: number;
}

export interface GenerationResult {
  /** Full text: prompt + generated tokens */
  text: string;
  /** Only the generated portion (without prompt) */
  generatedText: string;
  /** Token IDs of generated tokens */
  generatedIds: number[];
  /** Number of tokens generated */
  tokensGenerated: number;
  /** Why generation stopped: "maxTokens" | "eos" | "error" */
  stopReason: "maxTokens" | "eos" | "error";
}

// ============================================================
// TensorGenerator
// ============================================================

export class TensorGenerator {
  private model: TensorMiniMindModel;
  private tokenizer: BPETokenizer;

  constructor(model: TensorMiniMindModel, tokenizer: BPETokenizer) {
    this.model = model;
    this.tokenizer = tokenizer;
  }

  /**
   * Generate text autoregressively.
   *
   * @param prompt — Input text to condition generation on
   * @param options — Generation configuration
   * @returns Generated text result
   */
  generate(prompt: string, options: GenerationOptions): GenerationResult {
    const {
      maxTokens,
      temperature = 0.8,
      topK = 40,
      topP = 0.9,
      seed,
      eosTokenId = 3,
      maxContext = 256,
    } = options;

    // Create isolated RNG if seed provided, otherwise use global Random
    let seededRng: SeededRandom | null = null;
    const random = seed !== undefined
      ? (seededRng = new SeededRandom(seed), () => seededRng!.next())
      : () => Random.random();

    // Encode prompt
    const promptIds = prompt ? this.tokenizer.encode(prompt) : [];
    const generatedIds: number[] = [];
    const currentIds = [...promptIds];

    for (let step = 0; step < maxTokens; step++) {
      // Truncate to maxContext
      const ctx = currentIds.length > maxContext
        ? currentIds.slice(currentIds.length - maxContext)
        : currentIds;

      // Forward pass
      const input = Tensor.fromArray([ctx]);
      let nextTokenId: number;

      Tensor.noGrad(() => {
        const logits = this.model.forward(input); // [1, seqLen, vocabSize]

        // Extract last position logits
        const logitArr = logits.toArray() as number[][][];
        const seqLen = logitArr[0].length;
        const lastLogits = logitArr[0][Math.min(ctx.length - 1, seqLen - 1)];

        nextTokenId = this.sampleToken(lastLogits, random, {
          temperature,
          topK,
          topP,
        });
      });

      generatedIds.push(nextTokenId!);
      currentIds.push(nextTokenId!);

      // Stop conditions
      if (nextTokenId! === eosTokenId) {
        return {
          text: prompt + this.tokenizer.decode(generatedIds),
          generatedText: this.tokenizer.decode(generatedIds),
          generatedIds,
          tokensGenerated: generatedIds.length,
          stopReason: "eos",
        };
      }

      }

    const generatedText = this.tokenizer.decode(generatedIds);
    return {
      text: prompt + generatedText,
      generatedText,
      generatedIds,
      tokensGenerated: generatedIds.length,
      stopReason: "maxTokens",
    };
  }

  // ============================================================
  // Sampling
  // ============================================================

  /**
   * Sample a single token from logits using the specified strategy.
   */
  private sampleToken(
    logits: number[],
    random: () => number,
    opts: { temperature: number; topK: number; topP: number }
  ): number {
    const { temperature, topK, topP } = opts;

    // Greedy (temperature = 0)
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

    // Apply temperature scaling
    const scaled = logits.map((l) => l / Math.max(temperature, 1e-8));

    // Compute softmax probabilities
    const maxLogit = Math.max(...scaled);
    const exps = scaled.map((l) => Math.exp(l - maxLogit));
    const expSum = exps.reduce((s, v) => s + v, 0);
    const probs = exps.map((e) => e / expSum);

    // Top-K filtering
    if (topK > 0 && topK < probs.length) {
      const indexed = probs.map((p, i) => ({ p, i }));
      indexed.sort((a, b) => b.p - a.p);
      const cutoffIdx = Math.min(topK, indexed.length) - 1;
      const cutoff = indexed[cutoffIdx].p;

      for (let i = 0; i < probs.length; i++) {
        if (probs[i] < cutoff) probs[i] = 0;
      }

      // Renormalize
      const sum = probs.reduce((s, p) => s + p, 0);
      if (sum > 0) {
        for (let i = 0; i < probs.length; i++) {
          probs[i] /= sum;
        }
      }
    }

    // Top-P (nucleus) filtering
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

      // Renormalize
      const sum = probs.reduce((s, p) => s + p, 0);
      if (sum > 0) {
        for (let i = 0; i < probs.length; i++) {
          probs[i] /= sum;
        }
      }
    }

    // Sample from final distribution
    const r = random();
    let cumProb = 0;
    for (let i = 0; i < probs.length; i++) {
      cumProb += probs[i];
      if (r < cumProb) {
        return i;
      }
    }

    // Fallback: return last token
    return probs.length - 1;
  }
}
